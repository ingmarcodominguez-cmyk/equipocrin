import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

function AgendaMensualPro({ userData }) {
  const [turnos, setTurnos] = useState([])
  const [users, setUsers] = useState([])
  const [mesActual, setMesActual] = useState(new Date())
  const [diaSeleccionado, setDiaSeleccionado] = useState(null)
  const [turnoEditando, setTurnoEditando] = useState(null)
  
  const [form, setForm] = useState({ 
    paciente_nombre: '', profesional_id: '', prestacion: 'Turno primera vez', 
    hora: '09:00', observaciones: '', estado: 'pendiente' 
  })

  // 1. Lógica de roles: Solo ADMINISTRACION tiene permiso de ver todo
  const rol = userData?.rol?.toUpperCase() || "";
  const esAdmin = rol === 'ADMINISTRACION';

  useEffect(() => {
    cargarDatos();
  }, [mesActual]);

  async function cargarDatos() {
    const { data: t } = await supabase.from('turnos').select('*');
    const { data: u } = await supabase.from('users').select('*');
    if (t) setTurnos(t);
    if (u) setUsers(u);
  }

  // 2. Filtro: Si no es Admin, filtra obligatoriamente por su ID
  const turnosVisibles = esAdmin 
    ? turnos 
    : turnos.filter(t => String(t.profesional_id || '').trim() === String(userData?.id || '').trim());

  const prestaciones = ['Turno primera vez', 'Evaluacion', 'Reunion', 'Entrenamiento', 'Devolucion'];

  const generarHorarios = () => {
    const arr = [];
    for (let h = 9; h <= 12; h++) {
      for (let m = 0; m < 60; m += 45) {
        if (h === 12 && m > 45) break;
        arr.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      }
    }
    for (let h = 14; h <= 20; h++) {
      for (let m = 0; m < 60; m += 45) {
        arr.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      }
    }
    return arr;
  };

  async function guardarTurno() {
    const fechaISO = `${mesActual.getFullYear()}-${String(mesActual.getMonth() + 1).padStart(2, '0')}-${String(diaSeleccionado).padStart(2, '0')}T${form.hora}:00`;
    const profesionalObj = users.find(u => String(u.id) === String(form.profesional_id));
    const nombreProf = profesionalObj ? profesionalObj.nombre : 'Sin Prof.';
    const obsEmpaquetadas = `[${form.hora}] [${form.prestacion}] [${nombreProf}] ${form.observaciones}`;
    
    const payload = { 
      paciente_nombre: form.paciente_nombre, 
      profesional_id: form.profesional_id, 
      fecha_inicio: fechaISO, 
      observaciones: obsEmpaquetadas, 
      estado: form.estado 
    };

    if (turnoEditando) {
      await supabase.from('turnos').update(payload).eq('id', turnoEditando.id);
    } else {
      await supabase.from('turnos').insert([payload]);
    }
    
    setDiaSeleccionado(null);
    setTurnoEditando(null);
    cargarDatos();
  }

  const diasEnMes = new Date(mesActual.getFullYear(), mesActual.getMonth() + 1, 0).getDate();
  const offset = (new Date(mesActual.getFullYear(), mesActual.getMonth(), 1).getDay() + 6) % 7;

  return (
    <div style={{ padding: '20px', backgroundColor: '#fff', color: '#000', borderRadius: '10px', fontSize: '14px' }}>
      
      <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginBottom: '20px' }}>
        <button onClick={() => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() - 1))}>← Anterior</button>
        <h2 style={{ fontSize: '20px' }}>{mesActual.toLocaleString('es-ES', { month: 'long', year: 'numeric' }).toUpperCase()}</h2>
        <button onClick={() => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() + 1))}>Siguiente →</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', border: '1px solid #ccc', backgroundColor: '#ccc' }}>
        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => <div key={d} style={{ textAlign: 'center', background: '#f4f4f4', padding: '10px', fontWeight: 'bold' }}>{d}</div>)}
        {[...Array(offset)].map((_, i) => <div key={`off-${i}`} style={{ background: '#fff', minHeight: '120px' }} />)}
        {[...Array(diasEnMes)].map((_, i) => {
          const dN = i + 1;
          const tD = (turnosVisibles || []).filter(t => {
            const f = new Date(t.fecha_inicio);
            return f.getUTCDate() === dN && f.getUTCMonth() === mesActual.getMonth() && f.getUTCFullYear() === mesActual.getFullYear();
          });
          
          return (
            <div key={i} style={{ minHeight: '120px', background: '#fff', padding: '5px' }}>
              <div onClick={() => { setDiaSeleccionado(dN); setTurnoEditando(null); setForm({ paciente_nombre: '', profesional_id: '', prestacion: 'Turno primera vez', hora: '09:00', observaciones: '', estado: 'pendiente' }); }} style={{ cursor: 'pointer', color: '#007bff', fontWeight: 'bold' }}>{dN} +</div>
              {tD.map(t => {
                const parts = t.observaciones?.split(']') || [];
                const hora = parts[0]?.replace('[', '') || '--:--';
                const prest = parts[1]?.replace('[', '') || '';
                const prof = parts[2]?.replace('[', '') || 'N/A';
                return (
                  <div key={t.id} onClick={(e) => { e.stopPropagation(); setTurnoEditando(t); setForm({...t, hora: hora, prestacion: prest}); setDiaSeleccionado(dN); }} style={{ fontSize: '11px', background: t.estado === 'realizado' ? '#d4edda' : t.estado === 'cancelado' ? '#f8d7da' : '#eefaff', padding: '4px', marginTop: '4px', cursor: 'pointer', borderRadius: '4px', border: '1px solid #ddd' }}>
                    <strong>{hora}</strong> | {t.paciente_nombre} | <em>{prest}</em> | <b>{prof}</b>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {diaSeleccionado && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '25px', width: '350px', borderRadius: '15px', color: '#000' }}>
            <h3>{turnoEditando ? 'Editar Turno' : 'Nuevo Turno'}</h3>
            <input placeholder="Paciente" value={form.paciente_nombre} onChange={e => setForm({...form, paciente_nombre: e.target.value})} style={{width: '100%', marginBottom: 15, padding: '10px'}} />
            <select value={form.prestacion} onChange={e => setForm({...form, prestacion: e.target.value})} style={{width: '100%', marginBottom: 15, padding: '10px'}}>{prestaciones.map(p => <option key={p} value={p}>{p}</option>)}</select>
            <select value={form.profesional_id} onChange={e => setForm({...form, profesional_id: e.target.value})} style={{width: '100%', marginBottom: 15, padding: '10px'}}><option value="">Seleccionar Profesional...</option>{users.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: 15 }}>
              <select value={form.hora} onChange={e => setForm({...form, hora: e.target.value})} style={{padding: '10px'}}>{generarHorarios().map(h => <option key={h} value={h}>{h}</option>)}</select>
              <input placeholder="Manual (HH:MM)" value={form.hora} onChange={e => setForm({...form, hora: e.target.value})} style={{padding: '10px'}} />
            </div>
            <select value={form.estado} onChange={e => setForm({...form, estado: e.target.value})} style={{width: '100%', marginBottom: 15, padding: '10px'}}><option value="pendiente">⏳ Pendiente</option><option value="realizado">✅ Realizado</option><option value="cancelado">❌ Cancelado</option></select>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={guardarTurno} style={{flex: 1, padding: '12px', background: '#007bff', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer'}}>GUARDAR</button>
              <button onClick={() => setDiaSeleccionado(null)} style={{flex: 1, padding: '12px', background: '#ccc', border: 'none', borderRadius: '8px', cursor: 'pointer'}}>CERRAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AgendaMensualPro;