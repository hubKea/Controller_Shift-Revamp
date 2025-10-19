/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./*.html', './js/**/*.{js,ts}', './scripts/**/*.{js,ts}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '"Noto Sans"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
