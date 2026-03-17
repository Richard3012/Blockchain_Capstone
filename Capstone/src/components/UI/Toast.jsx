import { useEffect } from 'react'
import { useStore } from '../../store/useStore'

const icons = {
  success: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  warning: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  error: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  info: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
}

const colors = {
  success: { border: 'border-l-green', bg: 'bg-green-50', text: 'text-green' },
  warning: { border: 'border-l-orange', bg: 'bg-orange-50', text: 'text-orange' },
  error: { border: 'border-l-red', bg: 'bg-red-50', text: 'text-red' },
  info: { border: 'border-l-blue', bg: 'bg-blue-50', text: 'text-blue' },
}

function ToastItem({ toast }) {
  const removeToast = useStore((state) => state.removeToast)
  const color = colors[toast.type] || colors.info

  useEffect(() => {
    const timer = setTimeout(() => {
      removeToast(toast.id)
    }, 4000)
    return () => clearTimeout(timer)
  }, [toast.id, removeToast])

  return (
    <div 
      className={`flex items-center gap-3 px-4 py-3 bg-white rounded-lg shadow-lg border-l-4 ${color.border} animate-slide-in min-w-[320px]`}
    >
      <span className={color.text}>{icons[toast.type]}</span>
      <p className="flex-1 text-sm text-text-primary">{toast.message}</p>
      <button 
        onClick={() => removeToast(toast.id)}
        className="p-1 text-text-muted hover:text-text-secondary transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

export default function Toast() {
  const toasts = useStore((state) => state.toasts)

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
      {toasts.slice(-4).map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  )
}
