import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

function AgendaSemanal({ userData }) {
  const [turnos, setTurnos] = useState([])
  const [users, setUsers] = useState([]) // Para cargar los profesionales en el desplegable
  
  // Estados para el formulario de nuevo turno
  const [pacienteNombre, setPacienteNombre] = useState('')
  const [tipoTurno, setTipoTurno] = useState('')
  const [profesionalSeleccionado, setProfesionalSeleccionado] = useState('')
  const [fechaHoraInicio, setFechaHoraInicio] = useState('')

  useEffect(() => {
    if (!userData?.id) return

    cargarTurnos()
    cargarProfesionales()

    const intervalo = setInterval(() => {
      cargarTurnos()
    }, 3000)

    return () => clearInterval(intervalo)
  }, [userData])

  // 1. CARGAR TURNOS CON FILTRO DE ROL
  async function cargarTurnos() {
    if (!userData?.id) return

    try {
      let query = supabase
        .from('turnos')
        .select('*')
        .eq('estado', 'agendado')

      const rolUsuario = (userData?.rol || userData?.role || '')?.toUpperCase()

      // Si es PROFESIONAL o AUXILIAR, solo ve sus propios turnos
      if (rolUsuario !== 'ADMINISTRACION' && rolUsuario !== 'DIRECCION') {
        query = query.eq('profesional_id', userData.id)
      }

      const { data, error } = await query.order('fecha_inicio', { ascending: true })

      if (error) console.error("Error al cargar turnos:", error)
      if (data) setTurnos(data)
    } catch (err) {
      console.error("Error crítico en cargarTurnos:", err)
    }
  }

  // 2. CARGAR LISTA DE PROFESIONALES PARA EL DESPLEGABLE DE ALTA
  async function cargarProfesionales() {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('rol', 'PROFESIONAL') // Solo traemos a los que atienden

      if (data) setUsers(data)
    } catch (err) {
      console.error("Error al cargar profesionales:", err)
    }
  }

  // 3. FUNCIÓN PARA AGENDAR UN NUEVO TURNO
  async function agendarTurno(e) {
    e.preventDefault()
    if (!pacienteNombre || !fechaHoraInicio) {
      alert('Por favor, completa el nombre del paciente y la fecha/hora.')
      return
    }

    const rolUsuario = (userData?.rol || userData?.role || '')?.toUpperCase()
    
    // Si el que agenda es un PROFESIONAL, el turno es para él mismo.
    // Si es de ADMINISTRACION, usa el ID del profesional seleccionado en el desplegable.
    let idProf = userData.id
    if (rolUsuario === 'ADMINISTRACION' || rolUsuario === 'DIRECCION') {
      if (!profesionalSeleccionado) {
        alert('Debes seleccionar un profesional para este turno.')
        return
      }
      idProf = profesionalSeleccionado
    }

    try {
      const { error } = await supabase
        .from('turnos')
        .insert([{
          paciente_nombre: pacienteNombre,
          tipo_turno: tipoTurno || 'General',
          fecha_inicio: fechaHoraInicio, // Guarda el formato "YYYY-MM-DDTHH:MM"
          profesional_id: idProf,
          estado: 'agendado'
        }])

      if (error) {
        alert('Error al agendar: ' + error.message)
      } else {
        alert('Turno agendado con éxito')
        setPacienteNombre('')
        setTipoTurno('')
        setFechaHoraInicio('')
        setProfesionalSeleccionado('')
        await cargarTurnos()
      }
    } catch (err) {
      console.error(err)
    }
  }

  const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

  // Detectamos el rol actual para saber si le mostramos o no el selector de profesionales
  const esAdminO= (userData?.rol || userData?.role || '')?.toUpperCase() === 'ADMINISTRACION' || (userData?.rol || userData?.role || '')?.toUpperCase() === 'DIRECCION'

  return (
    <div style={{ padding: 20 }}>
      <h1>Agenda semanal</h1>

      {/* FORMULARIO DE ALTA TOTALMENTE SEPARADO */}
      <form onSubmit={agendarTurno} style={{ marginBottom: 40, padding: 20, border: '1px solid #ddd', borderRadius: 10, backgroundColor: '#fff' }}>
        <h3>Agendar Nuevo Turno</h3>
        <div style={{ display: 'flex', gap: 15, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          
          <div>
            <label style={{ display: 'block', marginBottom: 5 }}>Paciente:</label>
            <input type="text" value={pacienteNombre} onChange={(e) => setPacienteNombre(e.target.value)} style={{ padding: 8, borderRadius: 6, border: '1px solid #ccc' }} placeholder="Nombre completo" />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 5 }}>Tipo de Turno:</label>
            <input type="text" value={tipoTurno} onChange={(e) => setTipoTurno(e.target.value)} style={{ padding: 8, borderRadius: 6, border: '1px solid #ccc' }} placeholder="Ej: Consulta, Control" />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 5 }}>Fecha y Hora:</label>
            <input type="datetime-local" value={fechaHoraInicio} onChange={(e) => setFechaHoraInicio(e.target.value)} style={{ padding: 8, borderRadius: 6, border: '1px solid #ccc' }} />
          </div>

          {/* Si es Administrativo, le aparece el desplegable para elegir qué Profesional va a atender */}
          {esAdminO && (
            <div>
              <label style={{ display: 'block', marginBottom: 5 }}>Asignar al Profesional:</label>
              <select value={profesionalSeleccionado} onChange={(e) => setProfessionalSeleccionado(e.target.value)} style={{ padding: 8, borderRadius: 6, border: '1px solid #ccc' }}>
                <option value="">Selecciona un profesional</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.nombre}</option>
                ))}
              </select>
            </div>
          )}

          <button type="submit" style={{ padding: '9px 15px', backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
            Agendar Turno
          </button>
        </div>
      </form>

      <hr />

      {/* LA VISTA DEL CALENDARIO (7 COLUMNAS) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 15, alignItems: 'start', marginTop: 20 }}>
        {diasSemana.map((dia, index) => {
          const turnosDia = Array.isArray(turnos) 
            ? turnos
                .filter((turno) => {
                  if (!turno?.fecha_inicio) return false
                  const fecha = new Date(turno.fecha_inicio)
                  return fecha.getDay() === index
                })
                .sort((a, b) => new Date(a.fecha_inicio) - new Date(b.fecha_inicio))
            : []

          return (
            <div key={dia} style={{ border: '1px solid lightgray', borderRadius: 10, padding: 10, minHeight: 400, backgroundColor: '#f8f8f8' }}>
              <h2 style={{ fontSize: 16, textAlign: 'center', borderBottom: '2px solid #ddd', paddingBottom: 5 }}>{dia}</h2>

              {turnosDia.map((turno) => (
                <div key={turno.id} style={{ backgroundColor: 'white', border: '1px solid #cbd5e1', borderRadius: 8, padding: 8, marginBottom: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <strong style={{ color: '#0284c7' }}>
                    {turno.fecha_inicio && turno.fecha_inicio.includes('T')
                      ? turno.fecha_inicio.split('T')[1].substring(0, 5)
                      : '00:00'
                    } hs
                  </strong>
                  <br />
                  <span style={{ fontSize: 14, fontWeight: '500' }}>{turno.paciente_nombre}</span>
                  <br />
                  <small style={{ color: '#64748b', block: 'inline-block', marginTop: 3 }}>
                    {turno.tipo_turno}
                  </small>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default AgendaSemanal