import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

function AgendaMensualPro() {
  const [turnos, setTurnos] = useState([])
  const [users, setUsers] = useState([])
  const [mesActual, setMesActual] = useState(new Date())
  const [diaSeleccionado, setDiaSeleccionado] = useState(null)
  const [turnoEditando, setTurnoEditando] = useState(null)
  
  const [form, setForm] = useState({ 
    paciente_nombre: '', profesional_id: '', tipo_turno: 'consulta', 
    hora: '09:00', observaciones: '', estado: 'pendiente' 
  })

  useEffect(() => { cargarTurnos(); cargarUsuarios() }, [mesActual])

  async function cargarTurnos() {
    const { data } = await supabase.from('turnos').select('*')
    if (data) setTurnos(data)
  }

  async function cargarUsuarios() {
    const { data } = await supabase.from('users').select('*')
    if (data) setUsers(data)
  }

  const generarHorarios = () => {
    const arr = []; let h = 9, m = 0;
    while (h < 18 || (h === 18 && m === 0)) {
      arr.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      m += 45; if (m >= 60) { h += 1; m -= 60; }
    }
    return arr;
  }

  const abrirNuevoTurno = (dia) => {
    setForm({ paciente_nombre: '', profesional_id: '', tipo_turno: 'consulta', hora: '09:00', observaciones: '', estado: 'pendiente' });
    setTurnoEditando(null);
    setDiaSeleccionado(dia);
  }

  async function guardarTurno() {
    const anio = mesActual.getFullYear();
    const mes = String(mesActual.getMonth() + 1).padStart(2, '0');
    const dia = String(diaSeleccionado).padStart(2, '0');
    const fechaCompleta = `${anio}-${mes}-${dia}T${form.hora}:00`;
    
    const payload = { 
      paciente_nombre: form.paciente_nombre, 
      profesional_id: form.profesional_id, 
      tipo_turno: form.tipo_turno, 
      fecha_inicio: fechaCompleta, 
      observaciones: form.observaciones,
      estado: form.estado 
    }

    if (turnoEditando) {
      await supabase.from('turnos').update(payload).eq('id', turnoEditando.id)
    } else {
      await supabase.from('turnos').insert(payload)
    }
    setDiaSeleccionado(null); setTurnoEditando(null); cargarTurnos()
  }

  const obtenerColor = (e) => e === 'realizado' ? '#d4edda' : e === 'cancelado' ? '#f8d7da' : '#f8f9fa'

  const diasEnMes = new Date(mesActual.getFullYear(), mesActual.getMonth() + 1, 0).getDate();
  const primerDiaDelMes = new Date(mesActual.getFullYear(), mesActual.getMonth(), 1).getDay();
  const offset = primerDiaDelMes === 0 ? 6 : primerDiaDelMes - 1;

  return (
    <div style={{ padding: '20px', backgroundColor: '#FFFFFF', color: '#000000', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', marginBottom: '20px' }}>
        <button onClick={() => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() - 1))}>← Anterior</button>
        <h2 style={{ margin: 0 }}>{mesActual.toLocaleString('es-ES', { month: 'long', year: 'numeric' }).toUpperCase()}</h2>
        <button onClick={() => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() + 1))}>Siguiente →</button>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '5px', border: '1px solid #ddd', backgroundColor: '#FFFFFF' }}>
        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
          <div key={d} style={{ textAlign: 'center', fontWeight: 'bold', padding: '10px', backgroundColor: '#f4f4f4', color: '#000000' }}>{d}</div>
        ))}
        
        {[...Array(offset)].map((_, i) => <div key={`empty-${i}`} style={{ minHeight: '160px', backgroundColor: '#FFFFFF' }}></div>)}

        {[...Array(diasEnMes)].map((_, i) => {
          const diaN = i + 1;
          const turnosDia = turnos.filter(t => {
             const d = new Date(t.fecha_inicio);
             return d.getMonth() === mesActual.getMonth() && d.getDate() === diaN && d.getFullYear() === mesActual.getFullYear();
          });
          
          return (
            <div key={i} style={{ minHeight: '160px', border: '1px solid #eee', padding: '5px', backgroundColor: '#FFFFFF' }}>
              <div onClick={() => abrirNuevoTurno(diaN)} style={{ fontWeight: 'bold', cursor: 'pointer', color: '#007bff', paddingBottom: '5px' }}>
                {diaN} +
              </div>
              {turnosDia.map(t => (
                <div key={t.id} onClick={(e) => { 
                    e.stopPropagation();
                    setTurnoEditando(t); 
                    setForm({...t, hora: t.fecha_inicio.split('T')[1].substring(0,5)});
                    setDiaSeleccionado(diaN);
                }} 
                style={{ fontSize: '10px', padding: '4px', margin: '2px 0', borderRadius: '3px', backgroundColor: obtenerColor(t.estado), border: '1px solid #ccc', cursor: 'pointer', color: '#000000' }}>
                  <b>{t.paciente_nombre}</b><br/>
                  {users.find(u => u.id === t.profesional_id)?.nombre || '...'} | {t.tipo_turno.toUpperCase()} | {t.fecha_inicio.split('T')[1].substring(0,5)}
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {(diaSeleccionado !== null) && (
        <div style={overlayStyle} onClick={() => { setDiaSeleccionado(null); setTurnoEditando(null) }}>
          <div style={modalStyle} onClick={e => e.stopPropagation()}>
            <h2>{turnoEditando ? 'Editar Turno' : 'Nuevo Turno'}</h2>
            <input style={inputStyle} placeholder="Nombre Paciente" value={form.paciente_nombre} onChange={e => setForm({...form, paciente_nombre: e.target.value})} />
            <select style={inputStyle} value={form.profesional_id} onChange={e => setForm({...form, profesional_id: e.target.value})}>
              <option value="">Seleccionar Profesional</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
            <select style={inputStyle} value={form.tipo_turno} onChange={e => setForm({...form, tipo_turno: e.target.value})}>
              {['consulta', 'primera_vez', 'evaluacion', 'devolucion', 'entrenamiento', 'reunion'].map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
            </select>
            <select style={inputStyle} value={form.hora} onChange={e => setForm({...form, hora: e.target.value})}>{generarHorarios().map(h => <option key={h} value={h}>{h}</option>)}</select>
            <select style={inputStyle} value={form.estado} onChange={e => setForm({...form, estado: e.target.value})}>
              <option value="pendiente">Pendiente</option>
              <option value="realizado">Realizado</option>
              <option value="cancelado">Cancelado</option>
            </select>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button style={{...btnStyle, background: '#007bff', color: '#fff'}} onClick={guardarTurno}>Guardar</button>
              <button style={{...btnStyle, background: '#ccc'}} onClick={() => { setDiaSeleccionado(null); setTurnoEditando(null) }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const inputStyle = { width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '5px', border: '1px solid #ccc' }
const btnStyle = { flex: 1, padding: '10px', borderRadius: '5px', border: 'none', cursor: 'pointer' }
const overlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center' }
const modalStyle = { background: '#fff', padding: '25px', borderRadius: '10px', width: '350px', border: '1px solid #ccc' }

export default AgendaMensualPro