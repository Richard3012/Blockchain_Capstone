import { QRCodeSVG } from 'qrcode.react'
import Button from '../UI/Button'

export default function ProductQRCode({ product, onClose }) {
  const qrData = JSON.stringify({
    type: 'product',
    id: product.id,
    sku: product.sku,
    name: product.name,
    price: product.price,
    category: product.category,
    scan_time: new Date().toISOString()
  })

  const handlePrint = () => {
    const svg = document.querySelector('#product-qr-svg svg')
    if (!svg) return
    
    const svgData = new XMLSerializer().serializeToString(svg)
    const svgBase64 = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)))
    
    const printWindow = window.open('', '_blank')
    printWindow.document.write(`
      <html>
        <head>
          <title>QR Code - ${product.sku}</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              display: flex; 
              flex-direction: column; 
              align-items: center; 
              justify-content: center; 
              min-height: 100vh; 
              margin: 0;
              padding: 20px;
              box-sizing: border-box;
            }
            .qr-container { 
              text-align: center; 
              border: 2px dashed #ccc; 
              padding: 20px; 
              border-radius: 8px;
            }
            .product-name { 
              font-size: 18px; 
              font-weight: bold; 
              margin-bottom: 8px; 
            }
            .sku { 
              font-size: 14px; 
              color: #666; 
              margin-bottom: 16px; 
            }
            .qr-image {
              width: 180px;
              height: 180px;
            }
            .price { 
              font-size: 16px; 
              font-weight: bold; 
              color: #4361ee; 
              margin-top: 12px; 
            }
            @media print {
              body { padding: 0; }
              .qr-container { border: none; }
            }
          </style>
        </head>
        <body>
          <div class="qr-container">
            <div class="product-name">${product.name}</div>
            <div class="sku">${product.sku}</div>
            <img class="qr-image" src="${svgBase64}" alt="QR Code" />
            <div class="price">$${product.price.toLocaleString()}</div>
          </div>
          <script>
            window.onload = function() {
              setTimeout(() => window.print(), 300);
            };
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  const handleDownload = () => {
    const svg = document.querySelector('#product-qr-svg svg')
    if (!svg) return
    
    const svgData = new XMLSerializer().serializeToString(svg)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()
    
    img.onload = () => {
      canvas.width = 200
      canvas.height = 200
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      
      const link = document.createElement('a')
      link.download = `${product.sku}-qr.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    }
    
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)))
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center">
          <h3 className="text-lg font-bold text-text-primary mb-1">{product.name}</h3>
          <p className="text-sm text-text-muted mb-4">{product.sku}</p>
          
          <div id="product-qr-svg" className="flex justify-center mb-4 p-4 bg-white rounded-lg border border-border">
            <QRCodeSVG 
              value={qrData} 
              size={180}
              level="H"
              includeMargin={true}
            />
          </div>
          
          <div className="bg-gray-50 rounded-lg p-3 mb-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-left text-text-muted">Category:</div>
              <div className="text-right text-text-primary">{product.category}</div>
              <div className="text-left text-text-muted">Price:</div>
              <div className="text-right text-text-primary font-medium">${product.price.toLocaleString()}</div>
              <div className="text-left text-text-muted">Stock:</div>
              <div className="text-right text-text-primary">{product.stock} units</div>
              <div className="text-left text-text-muted">Status:</div>
              <div className={`text-right font-medium ${
                product.status === 'In Stock' ? 'text-green' : 
                product.status === 'Low Stock' ? 'text-orange' : 'text-red'
              }`}>
                {product.status}
              </div>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleDownload} className="flex-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download
            </Button>
            <Button variant="secondary" onClick={handlePrint} className="flex-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print
            </Button>
          </div>
          
          <button 
            onClick={onClose}
            className="mt-4 text-sm text-text-muted hover:text-text-secondary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
