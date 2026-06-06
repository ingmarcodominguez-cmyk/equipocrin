import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

function AgendaFija({ userData }) {
  const [sesiones, setSesiones] = useState([])
  const [pacientes, setPacientes] = useState([])
  const [users, setUsers] = useState([])
  
  // Estados para carga
  const [dia, setDia] = useState('Lunes')
  const [hora, setHora] = useState('09:00')
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState('')
  const [prestadorSeleccionado, setPrestadorSeleccionado] = useState('')
  const [prestacion, setPrestacion] = useState('')

  // Estados de vista
  const [diaConsulta, setDiaConsulta] = useState('Lunes') 
  const [pacienteConsultaId, setPacienteConsultaId] = useState('') 
  const [esCelular, setEsCelular] = useState(window.innerWidth < 768)

  const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']
  const horarios = ['09:00', '09:45', '10:30', '11:15', '12:00', '12:45', '13:30', '14:15', '15:00', '15:45', '16:30', '17:15', '18:00', '18:45', '19:30', '20:15']

  useEffect(() => {
    function handleResize() { setEsCelular(window.innerWidth < 768) }
    window.addEventListener('resize', handleResize)
    
    // Carga inicial agresiva
    cargarDatos()
    
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  async function cargarDatos() {
    // Probamos AMBAS tablas para ver dónde están los datos
    const { data: s1 } = await supabase.from('sesiones_fijas').select('*');
    const { data: s2 } = await supabase.from('agendas_fijas').select('*');
    
    console.log("Filas en sesiones_fijas:", s1?.length);
    console.log("Filas en agendas_fijas:", s2?.length);

    // Si hay datos en una pero no en otra, ese es el problema.
    // Vamos a cargar la que tenga más datos o la que sea la correcta.
    if (s1 && s1.length > 0) {
      setSesiones(s1);
    } else if (s2 && s2.length > 0) {
      setSesiones(s2);
    }

    // Cargamos lo demás
    const { data: pData } = await supabase.from('pacientes').select('*');
    setPacientes(pData || []);
    
    const { data: uData } = await supabase.from('users').select('*');
    setUsers(uData || []);
  }

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
    if (!error) { alert('Sesión guardada'); cargarDatos() }
    else alert('Error: ' + error.message)
  }

  const cardStyle = { backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', marginBottom: '20px' }

  return (
    <div style={{ padding: esCelular ? '15px' : '30px', backgroundColor: '#f8fafc', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      
      {/* Panel Administrativo (Visible para todos para testear, podés volver a filtrar si querés) */}
      <div style={{ ...cardStyle, backgroundColor: '#f1f5f9' }}>
        <h2 style={{ fontSize: '16px', margin: '0 0 15px 0' }}>➕ Registrar Sesión</h2>
        <div style={{ display: 'grid', gridTemplateColumns: esCelular ? '1fr' : 'repeat(6, 1fr)', gap: '10px' }}>
          <select onChange={(e) => setDia(e.target.value)}>{dias.map(d => <option key={d} value={d}>{d}</option>)}</select>
          <select onChange={(e) => setHora(e.target.value)}>{horarios.map(h => <option key={h} value={h}>{h}</option>)}</select>
          <select onChange={(e) => setPacienteSeleccionado(e.target.value)}><option value="">Paciente...</option>{pacientes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
          <select onChange={(e) => setPrestadorSeleccionado(e.target.value)}><option value="">Profesional...</option>{users.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select>
          <input placeholder="Prestación" onChange={(e) => setPrestacion(e.target.value)} />
          <button onClick={agregarSesion} style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Guardar</button>
        </div>
      </div>

      {/* Selector de días tipo Barra Profesional */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '5px' }}>
        {dias.map(d => (
          <button key={d} onClick={() => setDiaConsulta(d)} style={{ padding: '8px 15px', borderRadius: '8px', border: diaConsulta === d ? 'none' : '1px solid #cbd5e1', backgroundColor: diaConsulta === d ? '#2563eb' : '#fff', color: diaConsulta === d ? '#fff' : '#475569', cursor: 'pointer' }}>
            {d.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Grilla Principal */}
      <div style={{ display: 'flex', flexDirection: esCelular ? 'column' : 'row', gap: '20px' }}>
        <div style={{ ...cardStyle, flex: 1 }}>
          <h3 style={{ borderBottom: '2px solid #f1f5f9', paddingBottom: '10px' }}>Horarios del {diaConsulta}</h3>
          {sesiones.filter(s => s.dia_semana === diaConsulta).map(s => (
            <div key={s.id} style={{ padding: '12px', borderBottom: '1px solid #f8fafc', display: 'flex', alignItems: 'center' }}>
              <div style={{ width: '80px', fontWeight: 'bold' }}>{s.hora}</div>
              <div>{s.paciente_nombre} <small style={{ color: '#64748b' }}>({users.find(u => u.id === s.profesional_id)?.nombre})</small></div>
            </div>
          ))}
        </div>

        <div style={{ ...cardStyle, flex: 1 }}>
          <h3 style={{ borderBottom: '2px solid #f1f5f9', paddingBottom: '10px' }}>Auditoría por Paciente</h3>
          <select onChange={(e) => setPacienteConsultaId(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '10px' }}>
            <option value="">Seleccionar paciente...</option>
            {pacientes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          {sesiones.filter(s => s.paciente_id === pacienteConsultaId).map(s => (
            <div key={s.id} style={{ padding: '10px', backgroundColor: '#f8fafc', borderRadius: '8px', marginBottom: '5px' }}>
              {s.dia_semana} | {s.hora} hs | {s.tipo_prestacion}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
export default AgendaFija