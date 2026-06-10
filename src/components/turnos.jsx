import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

function Turnos() {
  const [turnos, setTurnos] = useState([])
  const [users, setUsers] = useState([])
  const [filtroProfesional, setFiltroProfesional] = useState('')
  const [nombrePaciente, setNombrePaciente] = useState('')
  const [profesionalId, setProfesionalId] = useState('')
  const [tipoTurno, setTipoTurno] = useState('')
  const [fecha, setFecha] = useState('')
  const [hora, setHora] = useState('08')
  const [minutos, setMinutos] = useState('00')
  const [observaciones, setObservaciones] = useState('')

  useEffect(() => {
    cargarTurnos()
    cargarUsuarios()
  }, [filtroProfesional])

  async function cargarTurnos() {
    let query = supabase.from('turnos').select('*').eq('estado', 'agendado')
    if (filtroProfesional) query = query.eq('profesional_id', filtroProfesional)
    const { data } = await query.order('fecha_inicio', { ascending: true })
    if (data) setTurnos(data)
  }

  async function cargarUsuarios() {
    const { data } = await supabase.from('users').select('*')
    if (data) setUsers(data)
  }

  async function crearTurno() {
    if (!nombrePaciente || !profesionalId || !tipoTurno || !fecha) return alert('Completar todos los campos');
    const fechaCompleta = `${fecha}T${hora}:${minutos}:00`
    
    const { error } = await supabase.from('turnos').insert([{ 
      profesional_id: profesionalId, tipo_turno: tipoTurno, estado: 'agendado', 
      fecha_inicio: fechaCompleta, observaciones, paciente_nombre: nombrePaciente 
    }])

    if (error) alert('Error creando turno')
    else {
      alert('Turno creado'); setNombrePaciente(''); setProfesionalId(''); setTipoTurno(''); setFecha(''); setObservaciones(''); cargarTurnos();
    }
  }

  async function cambiarEstadoTurno(id, nuevoEstado) {
    await supabase.from('turnos').update({ estado: nuevoEstado }).eq('id', id)
    cargarTurnos()
  }

  return (
    <div style={{ color: '#fff', padding: '20px' }}>
      <h1 style={{ color: '#00f2ff' }}>Gestión de Turnos</h1>
      
      {/* FORMULARIO */}
      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>➕ Nuevo Turno</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
          <input style={inputStyle} placeholder="Nombre paciente" value={nombrePaciente} onChange={(e) => setNombrePaciente(e.target.value)} />
          <select style={inputStyle} value={profesionalId} onChange={(e) => setProfesionalId(e.target.value)}>
            <option value="">Seleccionar Profesional...</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
          <select style={inputStyle} value={tipoTurno} onChange={(e) => setTipoTurno(e.target.value)}>
            <option value="">Tipo de turno...</option>
            {['Neurología', 'Dirección', 'Entrenamiento padres', 'Consulta', 'Evaluación'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input type="date" style={inputStyle} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          <div style={{ display: 'flex', gap: '5px' }}>
             <select style={inputStyle} value={hora} onChange={(e) => setHora(e.target.value)}>{Array.from({length:24}, (_,i) => <option key={i} value={String(i).padStart(2,'0')}>{String(i).padStart(2,'0')}</option>)}</select>
             <select style={inputStyle} value={minutos} onChange={(e) => setMinutos(e.target.value)}>{['00','15','30','45'].map(m => <option key={m} value={m}>{m}</option>)}</select>
          </div>
        </div>
        <textarea style={{...inputStyle, marginTop: '15px'}} placeholder="Observaciones" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
        <button onClick={crearTurno} style={btnAccionStyle}>CREAR TURNO</button>
      </div>

      {/* LISTADO */}
      {Object.entries(turnos.reduce((grupos, turno) => {
        const fecha = new Date(turno.fecha_inicio).toLocaleDateString('es-AR')
        if (!grupos[fecha]) grupos[fecha] = []
        grupos[fecha].push(turno); return grupos
      }, {})).map(([fecha, turnosDia]) => (
        <div key={fecha} style={{ marginBottom: '30px' }}>
          <h2 style={{ borderBottom: '2px solid #00f2ff', display: 'inline-block', paddingRight: '20px' }}>{fecha}</h2>
          {turnosDia.map(turno => (
            <div key={turno.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, color: '#00f2ff' }}>{turno.tipo_turno}</h3>
                <span style={{ fontSize: '0.9rem', color: '#888' }}>{turno.fecha_inicio.split('T')[1].substring(0,5)} hs</span>
              </div>
              <p style={{ margin: '10px 0' }}><strong>Paciente:</strong> {turno.paciente_nombre}</p>
              <p style={{ margin: '10px 0' }}><strong>Profesional:</strong> {users.find(u => u.id === turno.profesional_id)?.nombre}</p>
              <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                <button onClick={() => cambiarEstadoTurno(turno.id, 'realizado')} style={{...btnAccionStyle, background: '#00ff9d', color: '#000'}}>Realizado</button>
                <button onClick={() => cambiarEstadoTurno(turno.id, 'cancelado')} style={{...btnAccionStyle, background: '#ff4444', color: '#fff'}}>Cancelar</button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// Estilos Reutilizados
const cardStyle = { background: '#0a0a0a', border: '1px solid #333', borderRadius: '15px', padding: '20px', marginBottom: '15px' };
const inputStyle = { background: '#000', border: '1px solid #444', color: '#fff', padding: '12px', borderRadius: '8px', width: '100%' };
const btnAccionStyle = { padding: '12px 20px', background: '#00f2ff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', marginTop: '15px' };

export default Turnos;