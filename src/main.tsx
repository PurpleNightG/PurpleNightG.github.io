import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { SurveyPendingProvider } from './contexts/SurveyPendingContext'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SurveyPendingProvider>
      <App />
    </SurveyPendingProvider>
  </React.StrictMode>,
)
