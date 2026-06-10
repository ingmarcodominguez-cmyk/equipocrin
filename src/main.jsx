
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import OneSignal
from 'react-onesignal'

import './index.css'
import App from './App.jsx'

OneSignal.init({

  appId:
    '193f058c-e58c-460c-a1ba-59524983e7ac',

  notifyButton: {
    enable: true
  },

  allowLocalhostAsSecureOrigin: true

})

createRoot(
  document.getElementById('root')
).render(

  <StrictMode>
    <App />
  </StrictMode>,
)


