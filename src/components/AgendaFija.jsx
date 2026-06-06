import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

function AgendaFija({ userData }) {
  const [sesiones, setSesiones] = useState([])
  const [pacientes, setPacientes] = useState([])
  const [users, setUsers] = useState([])
  
  const [dia, setDia] = useState('Lunes')
  const [hora, setHora] = useState('09:00')
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState('')
  const [prestadorSeleccionado, setPrestadorSeleccionado] = useState('')
  const [prestacion, setPrestacion] = useState('')

  const [diaConsulta, setDiaConsulta] = useState('Lunes') 
  const [pacienteConsultaId, setPacienteConsultaId] = useState('') 
  const [esCelular, setEsCelular] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false)

  const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']
  const horarios = ['09:00', '09:45', '10:30', '11:15', '12:00', '12:45', '13:30', '14:15', '15:00', '15:45', '16:30', '17:15', '18:00', '18:45', '19:30', '20:15']

  useEffect(() => {
    function manejarResize() { setEsCelular(window.innerWidth < 768) }
    window.addEventListener('resize', manejarResize)
    
    async function inicializar() {
      await Promise.all([cargarPacientes(), cargarUsuarios(), cargarSesionesTodas()])
    }
    inicializar()
    return () => window.removeEventListener('resize', manejarResize)
  }, [userData?.id])

  async function cargarSesionesTodas() {
    const { data } = await supabase.from('sesiones_fijas').select('*').order('hora')
    setSesiones(data || [])
  }

  async function cargarPacientes() { const { data } = await supabase.from('pacientes').select('*').order('nombre'); if(data) setPacientes(data) }
  async function cargarUsuarios() { const { data } = await supabase.from('users').select('*').order('nombre'); if(data) setUsers(data) }

  async function agregarSesion() {
    const p = pacientes.find(p => p.id === pacienteSeleccionado)
    const { error } = await supabase.from('sesiones_fijas').insert([{
      paciente_id: pacienteSeleccionado,
      paciente_nombre: p?.nombre,
      profesional_id: prestadorSeleccionado,
      dia_semana: dia,
      hora: hora,
      tipo_prestacion: prestacion
    }])
    if (!error) { alert('Sesión guardada'); cargarSesionesTodas() }
  }

  // Estilos "Premium"
  const navButtonStyle = (d) => ({
    padding: '10px 15px',
    borderRadius: '8px',
    border: diaConsulta === d ? 'none' : '1px solid #cbd5e1',
    backgroundColor: diaConsulta === d ? '#2563eb' : '#fff',
    color: diaConsulta === d ? '#fff' : '#475569',
    fontWeight: '600',
    cursor: 'pointer',
    transition: '0.3s'
  })

  return (
    <div style={{ padding: esCelular ? '15px' : '30px', backgroundColor: '#f8fafc', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      
      {/* Panel Administrativo */}
      <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '25px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '15px', color: '#1e293b' }}>➕ Registrar Nueva Sesión</h2>
        <div style={{ display: 'grid', gridTemplateColumns: esCelular ? '1fr' : 'repeat(6, 1fr)', gap: '10px' }}>
          <select onChange={(e) => setDia(e.target.value)}>{dias.map(d => <option key={d} value={d}>{d}</option>)}</select>
          <select onChange={(e) => setHora(e.target.value)}>{horarios.map(h => <option key={h} value={h}>{h}</option>)}</select>
          <select onChange={(e) => setPacienteSeleccionado(e.target.value)}><option value="">Paciente...</option>{pacientes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
          <select onChange={(e) => setPrestadorSeleccionado(e.target.value)}><option value="">Profesional...</option>{users.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select>
          <input placeholder="Prestación" onChange={(e) => setPrestacion(e.target.value)} />
          <button onClick={agregarSesion} style={{ backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '6px' }}>Guardar</button>
        </div>
      </div>

      {/* Selector de días tipo "Barra Profesional" */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '5px' }}>
        {dias.map(d => <button key={d} onClick={() => setDiaConsulta(d)} style={navButtonStyle(d)}>{d.toUpperCase()}</button>)}
      </div>

      {/* Grilla Principal */}
      <div style={{ display: 'flex', flexDirection: esCelular ? 'column' : 'row', gap: '20px' }}>
        <div style={{ flex: 1, backgroundColor: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ color: '#1e293b', borderBottom: '2px solid #f1f5f9', paddingBottom: '10px' }}>Horarios del {diaConsulta}</h3>
          {sesiones.filter(s => s.dia_semana === diaConsulta).map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', padding: '12px', borderBottom: '1px solid #f8fafc' }}>
              <div style={{ width: '80px', fontWeight: 'bold', color: '#2563eb' }}>{s.hora}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '600' }}>{s.paciente_nombre}</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>{users.find(u => u.id === s.profesional_id)?.nombre} | {s.tipo_prestacion}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ flex: 1, backgroundColor: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ color: '#1e293b', borderBottom: '2px solid #f1f5f9', paddingBottom: '10px' }}>Auditoría por Paciente</h3>
          <select onChange={(e) => setPacienteConsultaId(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', marginBottom: '15px' }}>
            <option value="">Seleccionar paciente...</option>
            {pacientes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          {sesiones.filter(s => s.paciente_id === pacienteConsultaId).map(s => (
            <div key={s.id} style={{ padding: '10px', backgroundColor: '#f8fafc', borderRadius: '8px', marginBottom: '8px' }}>
              <strong>{s.dia_semana}</strong> a las {s.hora}hs - <span style={{color: '#059669'}}>{s.tipo_prestacion}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
export default AgendaFija