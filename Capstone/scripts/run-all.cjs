const fs = require('fs')
const http = require('http')
const path = require('path')
const readline = require('readline')
const { spawn, spawnSync } = require('child_process')

const projectRoot = path.resolve(__dirname, '..')
const envPath = path.join(projectRoot, '.env')
const children = []

function prefixOutput(stream, label, isError = false) {
  if (!stream) return
  const rl = readline.createInterface({ input: stream })
  rl.on('line', (line) => {
    const message = `[${label}] ${line}`
    if (isError) {
      console.error(message)
    } else {
      console.log(message)
    }
  })
}

function runCommand(label, command, options = {}) {
  const child = spawn(process.env.comspec || 'cmd.exe', ['/d', '/s', '/c', command], {
    cwd: projectRoot,
    env: process.env,
    windowsHide: false,
    ...options,
  })

  prefixOutput(child.stdout, label)
  prefixOutput(child.stderr, label, true)
  children.push(child)
  return child
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Process exited with code ${code}`))
      }
    })
  })
}

function killPort(port) {
  const command = `
    $connections = Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue;
    foreach ($connection in $connections) {
      try { Stop-Process -Id $connection.OwningProcess -Force -ErrorAction SilentlyContinue } catch {}
    }
  `
  spawnSync('powershell.exe', ['-NoProfile', '-Command', command], { cwd: projectRoot, stdio: 'ignore' })
}

function rpcReady() {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_chainId',
      params: [],
      id: 1,
    })

    const request = http.request(
      {
        hostname: '127.0.0.1',
        port: 8545,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (response) => {
        let body = ''
        response.on('data', (chunk) => { body += chunk })
        response.on('end', () => {
          resolve(response.statusCode === 200 && body.includes('result'))
        })
      },
    )

    request.on('error', () => resolve(false))
    request.write(payload)
    request.end()
  })
}

async function waitForRpc(maxAttempts = 30) {
  for (let index = 0; index < maxAttempts; index += 1) {
    if (await rpcReady()) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  return false
}

function updateEnvValue(key, value) {
  const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
  const line = `${key}=${value}`
  const pattern = new RegExp(`^${key}=.*$`, 'm')

  const next = pattern.test(current)
    ? current.replace(pattern, line)
    : `${current.trimEnd()}\n${line}\n`

  fs.writeFileSync(envPath, next)
}

function deployAnchor() {
  return new Promise((resolve, reject) => {
    const child = runCommand('anchor', 'npm.cmd run deploy:anchor -- --network localhost')
    let output = ''

    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        output += chunk.toString()
      })
    }

    child.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Anchor deployment failed with code ${code}`))
        return
      }

      const match = output.match(/ERPRecordAnchor deployed at:\s*(0x[a-fA-F0-9]{40})/)
      if (!match) {
        reject(new Error('Could not parse deployed anchor address'))
        return
      }

      resolve(match[1])
    })
  })
}

async function startBlockchainLayer() {
  const existingRpc = await rpcReady()

  if (!existingRpc) {
    killPort(8545)
    runCommand('hardhat', 'npm.cmd run node')
  } else {
    console.log('[orchestrator] Reusing existing Hardhat RPC on 8545')
  }

  const ready = await waitForRpc()
  if (!ready) {
    console.warn('[orchestrator] Hardhat RPC did not start. Continuing without blockchain auto-deploy.')
    return
  }

  try {
    const anchorAddress = await deployAnchor()
    updateEnvValue('RECORD_ANCHOR_ADDRESS', anchorAddress)
  } catch (error) {
    console.warn('[orchestrator] Anchor deploy failed. Continuing without fresh contract address.')
    console.warn(error.message)
  }
}

async function main() {
  console.log('[orchestrator] Starting BlockERP local stack')

  killPort(3000)
  killPort(4000)

  updateEnvValue('CLIENT_ORIGIN', 'http://localhost:3000')
  updateEnvValue('VITE_API_URL', 'http://localhost:4000/api')

  await startBlockchainLayer()

  runCommand('backend', 'npm.cmd run server')
  runCommand('frontend', 'npm.cmd run dev -- --host localhost --port 3000 --strictPort')

  console.log('[orchestrator] Frontend expected at http://localhost:3000')
  console.log('[orchestrator] Backend expected at http://localhost:4000')
  console.log('[orchestrator] Press Ctrl+C to stop all processes')
}

function shutdown() {
  for (const child of children) {
    if (!child.killed) {
      child.kill()
    }
  }
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

main().catch((error) => {
  console.error('[orchestrator] Failed to start BlockERP stack')
  console.error(error)
  shutdown()
})
