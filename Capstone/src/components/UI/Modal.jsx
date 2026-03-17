import { useEffect } from 'react'
import { useStore } from '../../store/useStore'

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-4xl',
  full: 'max-w-6xl'
}

export default function Modal({ title, children, onClose, isOpen = true, size = 'lg' }) {
  const closeModal = useStore((state) => state.closeModal)
  const handleClose = onClose || closeModal

  useEffect(() => {
    if (!isOpen) return
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        handleClose()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [handleClose, isOpen])

  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45"
      onClick={handleClose}
    >
      <div 
        className={`bg-white rounded-xl ${sizeClasses[size]} w-full mx-4 shadow-2xl animate-modal-in max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
            <button 
              onClick={handleClose}
              className="p-1 text-text-muted hover:text-text-secondary transition-colors rounded-lg hover:bg-gray-100"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className={title ? "p-6" : ""}>
          {children}
        </div>
      </div>
    </div>
  )
}
