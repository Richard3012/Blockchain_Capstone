const variants = {
  // Status variants (new)
  'active': 'bg-green/10 text-green',
  'inactive': 'bg-gray-100 text-text-secondary',
  
  // Status variants (legacy)
  'Customer': 'bg-green/10 text-green',
  'Prospect': 'bg-purple/10 text-purple',
  'Lead': 'bg-orange/10 text-orange',
  'Churned': 'bg-gray-100 text-text-secondary',
  
  // Order status
  'Shipped': 'bg-purple/10 text-purple',
  'Processing': 'bg-orange/10 text-orange',
  'Delivered': 'bg-green/10 text-green',
  'Cancelled': 'bg-red/10 text-red',
  'Pending': 'bg-gray-100 text-text-secondary',
  
  // Invoice status
  'Paid': 'bg-green/10 text-green',
  'Overdue': 'bg-red/10 text-red',
  'Draft': 'bg-gray-100 text-text-secondary',
  'Sent': 'bg-blue/10 text-blue',
  
  // Ticket status
  'open': 'bg-blue/10 text-blue border border-blue/30',
  'in-progress': 'bg-orange/10 text-orange',
  'resolved': 'bg-green/10 text-green',
  'closed': 'bg-gray-100 text-text-secondary',
  
  // Priority
  'LOW': 'bg-gray-100 text-text-secondary',
  'MEDIUM': 'bg-blue/10 text-blue',
  'HIGH': 'bg-orange/10 text-orange',
  'CRITICAL': 'bg-red/10 text-red',
  
  // Stock status
  'In Stock': 'bg-green/10 text-green',
  'Low Stock': 'bg-orange/10 text-orange',
  'Out of Stock': 'bg-red/10 text-red',
  
  // Blockchain
  'Verified': 'bg-green/10 text-green',
  
  // Type badges
  'Invoice': 'bg-blue/10 text-blue',
  'Order': 'bg-purple/10 text-purple',
  'Audit': 'bg-gray-100 text-text-secondary',
  'Inventory': 'bg-orange/10 text-orange',
  
  // Role
  'admin': 'bg-green/10 text-green',
  'viewer': 'bg-gray-100 text-text-secondary',
  
  // Generic variants
  'primary': 'bg-blue/10 text-blue',
  'success': 'bg-green/10 text-green',
  'warning': 'bg-orange/10 text-orange',
  'danger': 'bg-red/10 text-red',
  'error': 'bg-red/10 text-red',
  'gray': 'bg-gray-100 text-text-secondary',
  'purple': 'bg-purple/10 text-purple',
}

export default function Badge({ children, variant, className = '', pulse = false }) {
  const variantClass = variants[variant] || variants[children] || variants.gray
  
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variantClass} ${pulse ? 'animate-pulse' : ''} ${className}`}>
      {children}
    </span>
  )
}
