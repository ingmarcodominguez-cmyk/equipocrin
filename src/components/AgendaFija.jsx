import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

function AgendaFija({ userData }) {
  const [sesiones, setSesiones] = useState([])
  const [pacientes, setPacientes] = useState([])
  const [users, setUsers] = useState([])
  const [rol, setRol] = useState('')

  // Estados para el formulario de carga (Solo ADMIN/DIRECCION)
  const [dia, setDia] = useState('Lunes')
  const [hora, setHora] = useState('09:00')
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState('')
  const [prestadorSeleccionado, setPrestadorSeleccionado] = useState('') 
  const [prestacion, setPrestacion] = useState('')

  // Estados de consulta compartidos/profesional
  const [diaConsulta, setDiaConsulta] = useState('Lunes') // Filtro de día para la grilla
  const [pacienteConsultaId, setPacienteConsultaId] = useState('') // Filtro para la ficha del niño

  const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']

  const horarios = [
    '09:00', '09:45', '10:30', '11:15', '12:00', '12:45', '13:30', 
    '14:15', '15:00', '15:45', '16:30', '17:15', '18:00', '18:45', 
    '19:30', '20:15'
  ]

  useEffect(() => {
    async function inicializarComponente() {
      await cargarPacientes()
      await cargarUsuarios()

      if (userData?.id) {
        const userRol = (userData.rol || '').toUpperCase()
        setRol(userRol)

        // Si es profesional, forzamos que el prestador seleccionado para las consultas sea él mismo
        if (userRol === 'PROFESIONAL' || userRol === 'AUXILIAR') {
          setPrestadorSeleccionado(userData.id)
        }
      }
    }
    inicializarComponente()
  }, [userData])

  // Recargar sesiones cuando cambia el rol o el día que se quiere mirar
  useEffect(() => {
    if (rol) {
      cargarSesiones()
    }
  }, [rol, diaConsulta]) 

  async function cargarPacientes() {
    const { data } = await supabase.from('pacientes').select('*').order('nombre')
    if (data) setPacientes(data)
  }

  async function cargarUsuarios() {
    const { data } = await supabase.from('users').select('*').order('nombre')
    if (data) setUsers(data)
  }

  async function cargarSesiones() {
    try {
      let query = supabase.from('sesiones_fijas').select('*').order('hora')

      // REGLA DE PRIVACIDAD: Si es Profesional/Auxiliar, la base de datos SOLO le escupe sus propios turnos fijos
      if (rol === 'PROFESIONAL' || rol === 'AUXILIAR') {
        query = query.eq('profesional_id', userData.id)
      }

      const { data, error } = await query
      if (error) console.error(error)
      if (data) setSesiones(data)
    } catch (err) {
      console.error(err)
    }
  }

  async function agregarSesion() {
    // Protección extra por código por si intentan hackear el frontend
    if (rol === 'PROFESIONAL' || rol === 'AUXILIAR') {
      alert('No tienes permisos para asignar tratamientos.')
      return
    }

    const pacienteObj = pacientes.find((p) => p.id === pacienteSeleccionado)
    
    if (!pacienteObj || !prestadorSeleccionado) {
      alert('Por favor, selecciona Paciente y Profesional.')
      return
    }

    try {
      const { error } = await supabase
        .from('sesiones_fijas')
        .insert([{
          paciente_id: pacienteObj.id,
          paciente_nombre: pacienteObj.nombre,
          profesional_id: prestadorSeleccionado, 
          dia_semana: dia,
          hora: hora,
          tipo_prestacion: prestacion
        }])

      if (!error) {
        alert('Tratamiento fijo asignado con éxito.')
        setPacienteSeleccionado('')
        setPrestacion('')
        setPrestadorSeleccionado('')
        await cargarSesiones()
      }
    } catch (err) {
      console.error(err)
    }
  }

  // LÓGICA DE FILTRADO REACTIVO
  // 1. ¿Qué tengo este día elegido?
  const sesionesDia = sesiones.filter((s) => s.dia_semana === diaConsulta)

  // 2. ¿A quién tengo / Cuándo viene este niño?
  const agendaCompletaDelNino = pacienteConsultaId 
    ? sesiones.filter(s => s.paciente_id === pacienteConsultaId)
    : []

  // Estilo base para elementos de formulario
  const selectStyle = {
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    backgroundColor: '#fff',
    fontSize: '14px',
    color: '#334155',
    outline: 'none',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
    cursor: 'pointer'
  }

  return (
    <div style={{ padding: '30px', fontFamily: '"Segoe UI", Roboto, sans-serif', backgroundColor: '#f8fafc', minHeight: '100vh', color: '#1e293b' }}>
      
      <header style={{ marginBottom: '25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: '700', color: '#0f172a', margin: '0 0 5px 0' }}>Agenda Semanal</h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>Cronograma perpetuo de tratamientos recurrentes</p>
        </div>
        <div style={{ backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0', padding: '8px 16px', borderRadius: '20px', fontSize: '13px', fontWeight: '600', color: '#475569' }}>
          Rol Activo: <span style={{ color: '#2563eb' }}>{rol || 'CARGANDO...'}</span>
        </div>
      </header>

      {/* ======================================================================= */}
      {/* VISTA CONDICIONAL: SE MUESTRA FORMULARIO SOLO A ADMIN Y DIRECCION */}
      {/* ======================================================================= */}
      {(rol === 'ADMINISTRACION' || rol === 'DIRECCION') && (
        <div style={{ 
          backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', marginBottom: '25px', 
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' 
        }}>
          <div style={{ width: '100%', fontSize: '14px', fontWeight: '700', color: '#2563eb', marginBottom: '4px' }}>
            ➕ Panel de Alta: Asignar Nuevo Tratamiento Fijo Anual
          </div>
          <select value={dia} onChange={(e) => setDia(e.target.value)} style={selectStyle}>
            {dias.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={hora} onChange={(e) => setHora(e.target.value)} style={selectStyle}>
            {horarios.map((h) => <option key={h} value={h}>{h} hs</option>)}
          </select>
          <select value={pacienteSeleccionado} onChange={(e) => setPacienteSeleccionado(e.target.value)} style={{ ...selectStyle, minWidth: '220px' }}>
            <option value="">Seleccionar Paciente</option>
            {pacientes.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <select value={prestadorSeleccionado} onChange={(e) => setPrestadorSeleccionado(e.target.value)} style={{ ...selectStyle, minWidth: '220px' }}>
            <option value="">Asignar Profesional</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
          <input placeholder="Prestación (ej: fono)" value={prestacion} onChange={(e) => setPrestacion(e.target.value)} style={{ ...selectStyle, minWidth: '150px' }} />
          <button 
            onClick={agregarSesion} 
            style={{ padding: '10px 24px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}
          >
            Agregar a la Grilla
          </button>
        </div>
      )}

      {/* ======================================================================= */}
      {/* SELECTOR DE DÍA PARA LA CONSULTA CRONOLÓGICA (VISIBLE PARA TODOS) */}
      {/* ======================================================================= */}
      <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '15px 20px', marginBottom: '25px', display: 'flex', alignItems: 'center', gap: '15px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
        <span style={{ fontSize: '15px', fontWeight: '600', color: '#334155' }}>Seleccionar Día a Consultar:</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          {dias.map((d) => (
            <button
              key={d}
              onClick={() => setDiaConsultar(d)}
              style={{
                padding: '8px 16px', borderRadius: '6px', border: '1px solid',
                borderColor: diaConsulta === d ? '#2563eb' : '#cbd5e1',
                backgroundColor: diaConsulta === d ? '#2563eb' : '#fff',
                color: diaConsulta === d ? '#fff' : '#475569',
                fontWeight: '600', fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s'
              }}
              onClick={() => setDiaConsulta(d)}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* GRID PRINCIPAL DE AUDITORÍA Y MONITOREO */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '25px', alignItems: 'start' }}>
        
        {/* ========================================== */}
        {/* COLUMNA IZQUIERDA: ¿QUÉ TENGO ESTE DÍA? */}
        {/* ========================================== */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '25px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #f1f5f9', paddingBottom: '12px' }}>
            <h2 style={{ fontSize: '17px', fontWeight: '700', color: '#1e293b', margin: 0 }}>📅 Mi Cronograma: {diaConsulta}</h2>
            <span style={{ backgroundColor: '#e0f2fe', color: '#0369a1', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600' }}>Horarios</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {horarios.map((h) => {
              const lista = sesionesDia.filter((s) => s.hora === h)
              if (lista.length === 0) return null

              return (
                <div key={h} style={{ display: 'flex', gap: '15px', backgroundColor: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ minWidth: '65px', fontWeight: '700', color: '#2563eb', fontSize: '15px' }}>
                    {h} hs
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {lista.map((s) => (
                      <div key={s.id} style={{ borderLeft: '3px solid #3b82f6', paddingLeft: '10px' }}>
                        <span style={{ fontWeight: '600', color: '#0f172a', fontSize: '15px', display: 'block' }}>{s.paciente_nombre}</span>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px', fontSize: '13px' }}>
                          <span style={{ color: '#64748b' }}>👤 {users.find((u) => u.id === s.profesional_id)?.nombre?.toUpperCase() || 'TERAPEUTA'}</span>
                          <span style={{ backgroundColor: '#f1f5f9', color: '#475569', padding: '1px 8px', borderRadius: '4px', fontWeight: '500' }}>{s.tipo_prestacion || 'Tratamiento'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}

            {sesionesDia.length === 0 && (
              <div style={{ textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', padding: '30px 0' }}>
                No registrás pacientes fijos asignados para los días {diaConsulta}.
              </div>
            )}
          </div>
        </div>

        {/* ========================================== */}
        {/* COLUMNA DERECHA: ¿A QUIÉN TENGO / CUÁNDO VIENE? */}
        {/* ========================================== */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '25px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #f1f5f9', paddingBottom: '12px' }}>
            <h2 style={{ fontSize: '17px', fontWeight: '700', color: '#1e293b', margin: 0 }}>👦 Ficha del Paciente (Días y Horas)</h2>
            <span style={{ backgroundColor: '#dcfce7', color: '#15803d', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600' }}>Filtro de Asistencia</span>
          </div>

          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '-10px', marginBottom: '15px' }}>
            {rol === 'PROFESIONAL' || rol === 'AUXILIAR' 
              ? 'Seleccioná un niño para ver los días y horas exactos en los que se atiende CON VOS:' 
              : 'Seleccioná un niño para auditar su esquema completo de atención semanal:'}
          </p>

          <select 
            value={pacienteConsultaId} 
            onChange={(e) => setPacienteConsultaId(e.target.value)} 
            style={{ ...selectStyle, width: '100%', padding: '12px', border: '1px solid #86efac', fontSize: '14px', marginBottom: '20px' }}
          >
            <option value="">Elegí un paciente del listado...</option>
            {pacientes.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {pacienteConsultaId && agendaCompletaDelNino.length === 0 && (
              <div style={{ textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', padding: '20px 0' }}>
                No se registran sesiones fijos con este paciente.
              </div>
            )}

            {pacienteConsultaId && agendaCompletaDelNino.map(s => (
              <div key={s.id} style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '14px', color: '#14532d', fontWeight: '700' }}>
                    📅 {s.dia_semana} — ⏰ {s.hora} hs
                  </div>
                  <span style={{ fontSize: '12px', backgroundColor: '#e6fbf0', color: '#166534', padding: '2px 8px', borderRadius: '4px', display: 'inline-block', marginTop: '5px', fontWeight: '500' }}>
                    {s.tipo_prestacion || 'Prestación'}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '11px', color: '#86efac', display: 'block' }}>Profesional:</span>
                  <span style={{ fontWeight: '700', color: '#14532d', fontSize: '13px' }}>
                    👤 {users.find(u => u.id === s.profesional_id)?.nombre || 'Terapeuta'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}

export default AgendaFija