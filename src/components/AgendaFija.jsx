import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

function AgendaFija({ userData }) {
  const [sesiones, setSesiones] = useState([])
  const [pacientes, setPacientes] = useState([])
  const [users, setUsers] = useState([])
  const [rol, setRol] = useState('')
  const [diaConsulta, setDiaConsulta] = useState('Lunes')
  const [pacienteConsultaId, setPacienteConsultaId] = useState('')
  const [esCelular, setEsCelular] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false)

  const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']
  const horarios = ['09:00', '09:45', '10:30', '11:15', '12:00', '12:45', '13:30', '14:15', '15:00', '15:45', '16:30', '17:15', '18:00', '18:45', '19:30', '20:15']

  // 1. Efecto maestro: Carga los datos apenas el userData está disponible
  useEffect(() => {
    function manejarResize() { setEsCelular(window.innerWidth < 768) }
    window.addEventListener('resize', manejarResize)

    async function inicializar() {
      if (!userData?.id) return
      
      const userRol = (userData.rol || '').toUpperCase()
      setRol(userRol)
      
      // Cargamos todo en paralelo para que sea más rápido
      await Promise.all([cargarPacientes(), cargarUsuarios(), cargarSesiones(userRol)])
    }

    inicializar()
    return () => window.removeEventListener('resize', manejarResize)
  }, [userData?.id]) // La dependencia clave para que no se "pierda" al navegar

  // 2. Efecto secundario: Recarga si el profesional cambia el día a consultar
  useEffect(() => {
    if (rol) cargarSesiones(rol)
  }, [diaConsulta])

  async function cargarPacientes() {
    const { data } = await supabase.from('pacientes').select('*').order('nombre')
    if (data) setPacientes(data)
  }

  async function cargarUsuarios() {
    const { data } = await supabase.from('users').select('*').order('nombre')
    if (data) setUsers(data)
  }

  async function cargarSesiones(rolActual) {
    try {
      let query = supabase.from('sesiones_fijas').select('*').order('hora')

      // Aplicar filtro de seguridad solo si es Profesional o Auxiliar
      if ((rolActual === 'PROFESIONAL' || rolActual === 'AUXILIAR') && userData?.id) {
        query = query.eq('profesional_id', userData.id)
      }

      const { data } = await query
      setSesiones(data || [])
    } catch (err) {
      console.error("Error cargando sesiones:", err)
    }
  }

  const sesionesDia = sesiones.filter((s) => s.dia_semana === diaConsulta)
  const agendaCompletaDelNino = pacienteConsultaId ? sesiones.filter(s => s.paciente_id === pacienteConsultaId) : []

  return (
    <div style={{ padding: esCelular ? '15px' : '30px', fontFamily: '"Segoe UI", sans-serif', backgroundColor: '#f8fafc', minHeight: '100vh' }}>
      <header style={{ marginBottom: '25px' }}>
        <h1 style={{ fontSize: '24px', margin: 0 }}>Agenda Semanal</h1>
        <div style={{ fontSize: '12px', color: '#64748b' }}>Rol: {rol || 'Cargando...'}</div>
      </header>

      {/* Botonera de días */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
        {dias.map((d) => (
          <button 
            key={d} 
            onClick={() => setDiaConsulta(d)}
            style={{ padding: '8px 12px', backgroundColor: diaConsulta === d ? '#2563eb' : '#fff', color: diaConsulta === d ? '#fff' : '#000', border: '1px solid #ccc', borderRadius: '6px', cursor: 'pointer' }}
          >
            {d}
          </button>
        ))}
      </div>

      {/* Grid Adaptable */}
      <div style={{ display: 'flex', flexDirection: esCelular ? 'column' : 'row', gap: '20px' }}>
        
        {/* Ficha Paciente */}
        <div style={{ flex: 1, backgroundColor: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <h3>Ficha del Paciente</h3>
          <select onChange={(e) => setPacienteConsultaId(e.target.value)} style={{ width: '100%', padding: '10px' }}>
            <option value="">Seleccionar paciente...</option>
            {pacientes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <div style={{ marginTop: '15px' }}>
            {agendaCompletaDelNino.map(s => (
              <div key={s.id} style={{ padding: '10px', borderBottom: '1px solid #eee' }}>
                {s.dia_semana} - {s.hora}hs: {s.tipo_prestacion}
              </div>
            ))}
          </div>
        </div>

        {/* Cronograma Diario */}
        <div style={{ flex: 1, backgroundColor: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <h3>Cronograma: {diaConsulta}</h3>
          {sesionesDia.map(s => (
            <div key={s.id} style={{ padding: '10px', borderBottom: '1px solid #eee' }}>
              <strong>{s.hora}</strong> - {s.paciente_nombre}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default AgendaFija