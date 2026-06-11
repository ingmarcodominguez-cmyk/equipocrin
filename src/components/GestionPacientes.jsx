import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

function GestionPacientes() {
  // --- BLOQUEO DE SALIDA: AVISO DE CONFIRMACIÓN ---
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '¿Seguro que quieres salir? Los cambios no guardados se perderán.';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);
  // -------------------------------------------------

  const [pacientes, setPacientes] = useState([])
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({
    nombre: '', dni: '', fecha_nacimiento: '', domicilio: '', 
    escuela: '', telefono: '', obra_social: '', diagnostico: ''
  })

  useEffect(() => { cargarPacientes(); }, []);

  async function cargarPacientes() {
    const { data } = await supabase.from('pacientes').select('*').order('nombre', { ascending: true });
    if (data) setPacientes(data);
  }

  const calcularEdad = (fecha) => {
    if (!fecha) return 0;
    const hoy = new Date();
    const nacimiento = new Date(fecha);
    let edad = hoy.getFullYear() - nacimiento.getFullYear();
    const mes = hoy.getMonth() - nacimiento.getMonth();
    if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) edad--;
    return edad;
  };

  function iniciarEdicion(p) {
    setEditId(p.id);
    setForm({
      nombre: p.nombre, dni: p.dni, fecha_nacimiento: p.fecha_nacimiento, 
      domicilio: p.domicilio, escuela: p.escuela, telefono: p.telefono, 
      obra_social: p.obra_social, diagnostico: p.diagnostico
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function guardarPaciente() {
    if (!form.nombre || !form.dni) return alert("Nombre y DNI son obligatorios");

    const edad = calcularEdad(form.fecha_nacimiento);
    const payload = { ...form, edad: edad };

    if (editId) {
      const { error } = await supabase.from('pacientes').update(payload).eq('id', editId);
      if (error) return alert("Error al actualizar: " + error.message);
      alert("Paciente actualizado");
    } else {
      const { error } = await supabase.from('pacientes').insert([payload]);
      if (error) return alert("Error al guardar: " + error.message);
      alert("Paciente registrado");
    }

    setForm({ nombre: '', dni: '', fecha_nacimiento: '', domicilio: '', escuela: '', telefono: '', obra_social: '', diagnostico: '' });
    setEditId(null);
    cargarPacientes();
  }

  return (
    <div style={{ color: '#fff', padding: '20px' }}>
      <h2 style={{ color: '#00f2ff' }}>{editId ? '✏️ Editando Paciente' : 'Gestión de Pacientes'}</h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px', background: '#1a1a1a', padding: '20px', borderRadius: '10px' }}>
        <input placeholder="Nombre Completo" value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} style={inputStyle} />
        <input placeholder="DNI" value={form.dni} onChange={e => setForm({...form, dni: e.target.value})} style={inputStyle} />
        <input type="date" value={form.fecha_nacimiento} onChange={e => setForm({...form, fecha_nacimiento: e.target.value})} style={inputStyle} />
        <input placeholder="Domicilio" value={form.domicilio} onChange={e => setForm({...form, domicilio: e.target.value})} style={inputStyle} />
        <input placeholder="Escuela" value={form.escuela} onChange={e => setForm({...form, escuela: e.target.value})} style={inputStyle} />
        <input placeholder="Teléfono" value={form.telefono} onChange={e => setForm({...form, telefono: e.target.value})} style={inputStyle} />
        <input placeholder="Obra Social" value={form.obra_social} onChange={e => setForm({...form, obra_social: e.target.value})} style={inputStyle} />
        <input placeholder="Diagnóstico" value={form.diagnostico} onChange={e => setForm({...form, diagnostico: e.target.value})} style={inputStyle} />
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <button onClick={guardarPaciente} style={btnStyle}>{editId ? 'ACTUALIZAR DATOS' : 'GUARDAR PACIENTE'}</button>
        {editId && <button onClick={() => { setEditId(null); setForm({nombre: '', dni: '', fecha_nacimiento: '', domicilio: '', escuela: '', telefono: '', obra_social: '', diagnostico: ''}); }} style={{...btnStyle, borderColor: '#666', color: '#ccc'}}>CANCELAR</button>}
      </div>

      <h3 style={{ marginTop: '30px', color: '#00f2ff' }}>Listado de Pacientes</h3>
      <div style={{ overflowX: 'auto', background: '#111', padding: '10px', borderRadius: '10px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#222', textAlign: 'left' }}>
              <th style={{ padding: '12px' }}>Acción</th>
              <th style={{ padding: '12px' }}>Nombre</th>
              <th style={{ padding: '12px' }}>Edad</th>
              <th style={{ padding: '12px' }}>DNI</th>
              <th style={{ padding: '12px' }}>Teléfono</th>
              <th style={{ padding: '12px' }}>Obra Social</th>
            </tr>
          </thead>
          <tbody>
            {pacientes.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '12px' }}>
                  <button onClick={() => iniciarEdicion(p)} style={{ background: 'none', border: 'none', color: '#00f2ff', cursor: 'pointer' }}>✏️ Editar</button>
                </td>
                <td style={{ padding: '12px' }}>{p.nombre}</td>
                <td style={{ padding: '12px' }}>{p.edad}</td>
                <td style={{ padding: '12px' }}>{p.dni}</td>
                <td style={{ padding: '12px' }}>{p.telefono}</td>
                <td style={{ padding: '12px' }}>{p.obra_social}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const inputStyle = { padding: '12px', borderRadius: '8px', border: '1px solid #444', background: '#000', color: '#fff' };
const btnStyle = { padding: '15px', background: 'transparent', border: '1px solid #00f2ff', color: '#00f2ff', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' };

export default GestionPacientes;