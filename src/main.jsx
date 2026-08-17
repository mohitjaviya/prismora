import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// A focused <input type="number"> treats the mouse wheel as increment/decrement,
// so scrolling the page over one silently edits the value — quantities and
// amounts get corrupted without the user noticing. Blurring on wheel restores
// normal page scrolling and leaves the value alone. Applied once globally
// rather than per-input: there are 46 number fields across the app.
document.addEventListener('wheel', () => {
  const el = document.activeElement;
  if (el && el.tagName === 'INPUT' && el.type === 'number') el.blur();
}, { passive: true });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
