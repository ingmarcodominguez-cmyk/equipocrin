import { useState, useEffect } from 'react'
import AgendaMensualPro from './AgendaMensualPro.jsx'
import AgendaFija from './AgendaFija.jsx'
import Tasks from './Tasks.jsx'
import Dashboard from './Dashboard.jsx'

function Layout({ userData, logout }) {
  const [vista, setVista] = useState(localStorage.getItem('vista') || 'dashboard')

  useEffect(() => {
    localStorage.setItem('vista', vista)
  }, [vista])

  if (!userData) return <div>Cargando...</div>

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Menú Lateral */}
      <div style={{ width: 250, backgroundColor: '#0f172a', color: 'white', padding: 20 }}>
        <h2>CRIN</h2>
        <p><strong>{userData?.nombre}</strong></p>
        <p>{userData?.rol}</p>
        <hr />
        <div style={{ marginTop: 30, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button onClick={() => setVista('dashboard')}>🏠 Menú Principal</button>
          <button onClick={() => setVista('agenda')}>📅 Agenda Mensual</button>
          <button onClick={() => setVista('tareas')}>✅ Tareas</button>
          <button onClick={() => setVista('profesionales')}>⚙️ Agenda Fija</button>
          <hr style={{ width: '100%' }} />
          <button onClick={logout} style={{ backgroundColor: '#ef4444', color: 'white' }}>Cerrar sesión</button>
        </div>
      </div>

      {/* Contenido Dinámico */}
      <div style={{ flex: 1, padding: 20 }}>
        {vista === 'dashboard' && <Dashboard userData={userData} setVista={setVista} />}
        {vista === 'agenda' && <AgendaMensualPro userData={userData} />}
        {vista === 'tareas' && <Tasks userData={userData} />}
        {vista === 'profesionales' && <AgendaFija userData={userData} />}
      </div>
    </div>
  )
}
export default Layout