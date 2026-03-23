/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'page-bg': '#f8f9fa',
        'card-bg': '#ffffff',
        'sidebar-bg': '#ffffff',
        'border': '#dadce0',
        'text-primary': '#111111',
        'text-secondary': '#3c4043',
        'text-muted': '#6b7280',
        'blue': '#1a73e8',
        'blue-light': '#e8f0fe',
        'green': '#1e8e3e',
        'orange': '#f9ab00',
        'red': '#d93025',
        'purple': '#7c3aed',
        'background': '#f8f9fa',
        'surface': '#ffffff',
      },
      fontFamily: {
        sans: ['Roboto', 'system-ui', 'sans-serif'],
        mono: ['Roboto Mono', 'monospace'],
      },
      width: {
        'sidebar': '200px',
      },
      height: {
        'topbar': '60px',
      },
    },
  },
  plugins: [],
}
