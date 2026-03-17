const variants = {
  primary: 'bg-blue text-white hover:bg-blue/90',
  secondary: 'bg-gray-100 text-text-primary hover:bg-gray-200',
  success: 'bg-green text-white hover:bg-green/90',
  danger: 'bg-red text-white hover:bg-red/90',
  warning: 'bg-orange text-white hover:bg-orange/90',
  outline: 'border border-border text-text-primary hover:bg-gray-50',
  ghost: 'text-text-secondary hover:bg-gray-100 hover:text-text-primary',
}

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
}

export default function Button({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  className = '', 
  disabled = false,
  onClick,
  type = 'button',
  icon,
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`
        inline-flex items-center justify-center gap-2 
        font-medium rounded-lg transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]} 
        ${sizes[size]} 
        ${className}
      `}
    >
      {icon && <span className="w-4 h-4">{icon}</span>}
      {children}
    </button>
  )
}
