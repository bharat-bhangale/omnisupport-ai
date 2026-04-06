/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./content.tsx",
    "./popup.html",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
  // Important: prefix all classes to avoid conflicts with host page styles
  prefix: '',
  // Enable important to ensure our styles override host page
  important: '#omnisupport-panel-root',
};
