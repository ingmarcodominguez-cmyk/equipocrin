import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

function GestionPacientes() {
  const [aviso, setAviso] = useState(false);
  const [pacientes, setPacientes] = useState([])
  const [editId, setEditId] = useState(null)
  const [busqueda, setBusqueda] = useState(''); 
  
  // Nuevo estado para el modal de ficha
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState(null);

  // Estados para el Listado y Descarga de Pacientes Activos
  const [modalListadoAbierto, setModalListadoAbierto] = useState(false);
  const [filtroListado, setFiltroListado] = useState('');
  const [filtroObraSocial, setFiltroObraSocial] = useState('TODAS');

  const [dia, setDia] = useState('');
  const [mes, setMes] = useState('');
  const [anio, setAnio] = useState('');

  const [form, setForm] = useState({
    nombre: '', dni: '', domicilio: '', 
    escuela: '', telefono: '', obra_social: '', diagnostico: ''
  })

  useEffect(() => {
    window.history.pushState(null, "", window.location.href);
    const handlePopState = () => {
      setAviso(true);
      setTimeout(() => setAviso(false), 3000);
      window.history.pushState(null, "", window.location.href);
    };
    window.addEventListener('popstate', handlePopState);
    cargarPacientes();
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  async function cargarPacientes() {
    const { data } = await supabase.from('pacientes_motor').select('*').order('nombre_apellido', { ascending: true });
    if (data) {
      setPacientes(data.map(p => ({
        ...p,
        id: p.id_paciente,
        nombre: p.nombre_apellido,
        telefono: p.tel_padres || p.tel_alternativo || ''
      })));
    }
  }

  const exportarExcelActivos = (lista = null) => {
    const fuente = lista || pacientes.filter(p => (p.estado || 'ACTIVO').toUpperCase() === 'ACTIVO');
    
    const encabezados = [
      'ID Paciente',
      'Nombre y Apellido',
      'DNI',
      'Edad',
      'Fecha Nacimiento',
      'Obra Social',
      'Diagnostico',
      'Telefono Padres',
      'Telefono Alternativo',
      'Domicilio',
      'Escuela',
      'Estado'
    ];

    const filas = fuente.map(p => [
      p.id_paciente || p.id || '',
      `"${(p.nombre_apellido || p.nombre || '').replace(/"/g, '""')}"`,
      `"${p.dni || ''}"`,
      p.edad || '',
      `"${p.fecha_nacimiento || ''}"`,
      `"${(p.obra_social || '').replace(/"/g, '""')}"`,
      `"${(p.diagnostico || '').replace(/"/g, '""')}"`,
      `"${(p.tel_padres || p.telefono || '').replace(/"/g, '""')}"`,
      `"${(p.tel_alternativo || '').replace(/"/g, '""')}"`,
      `"${(p.domicilio || '').replace(/"/g, '""')}"`,
      `"${(p.escuela || '').replace(/"/g, '""')}"`,
      `"${p.estado || 'ACTIVO'}"`
    ]);

    const csvContent = '\uFEFF' + [
      encabezados.join(';'),
      ...filas.map(f => f.join(';'))
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const fechaHoy = new Date().toISOString().split('T')[0];
    link.href = url;
    link.setAttribute('download', `Pacientes_Activos_Crin_${fechaHoy}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const pacientesActivos = pacientes.filter(p => (p.estado || 'ACTIVO').toUpperCase() === 'ACTIVO');
  const listaObrasSociales = Array.from(new Set(pacientesActivos.map(p => (p.obra_social || '').trim()).filter(Boolean))).sort();

  const pacientesListadoFiltrados = pacientesActivos.filter(p => {
    const q = filtroListado.toLowerCase().trim();
    const coincideTexto = !q || 
      (p.nombre_apellido && p.nombre_apellido.toLowerCase().includes(q)) ||
      (p.nombre && p.nombre.toLowerCase().includes(q)) ||
      (p.dni && String(p.dni).includes(q)) ||
      (p.obra_social && p.obra_social.toLowerCase().includes(q)) ||
      (p.diagnostico && p.diagnostico.toLowerCase().includes(q));

    const coincideOS = filtroObraSocial === 'TODAS' || (p.obra_social || '').trim().toUpperCase() === filtroObraSocial.toUpperCase();

    return coincideTexto && coincideOS;
  });

  const pacientesFiltrados = busqueda.trim() === '' 
    ? [] 
    : pacientes.filter(p => 
        (p.nombre && p.nombre.toLowerCase().includes(busqueda.toLowerCase())) || 
        (p.dni && p.dni.includes(busqueda))
      );

  const calcularEdad = (fecha) => {
    if (!fecha) return 0;
    const hoy = new Date();
    const nacimiento = new Date(fecha);
    let edad = hoy.getFullYear() - nacimiento.getFullYear();
    const m = hoy.getMonth() - nacimiento.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) edad--;
    return edad;
  };

  function iniciarEdicion(p) {
    setEditId(p.id);
    setForm({
      nombre: p.nombre, dni: p.dni, domicilio: p.domicilio, 
      escuela: p.escuela, telefono: p.telefono, obra_social: p.obra_social, diagnostico: p.diagnostico
    });
    if (p.fecha_nacimiento) {
      const parts = p.fecha_nacimiento.split(/[\/\-\.]/);
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          setAnio(parts[0]); setMes(parts[1]); setDia(parts[2]);
        } else {
          setDia(parts[0]); setMes(parts[1]); setAnio(parts[2]);
        }
      }
    }
    setPacienteSeleccionado(null); // Cerrar modal al editar
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function guardarPaciente() {
    if (!form.nombre || !form.dni || !dia || !mes || !anio) return alert("Nombre, DNI y Fecha de nacimiento son obligatorios");

    const fechaIso = `${anio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
    const fechaSlash = `${dia.padStart(2, '0')}/${mes.padStart(2, '0')}/${anio}`;
    const edad = calcularEdad(fechaIso);
    const payload = {
      nombre_apellido: form.nombre,
      dni: form.dni,
      domicilio: form.domicilio,
      escuela: form.escuela,
      tel_padres: form.telefono,
      obra_social: form.obra_social,
      diagnostico: form.diagnostico,
      fecha_nacimiento: fechaSlash,
      edad: String(edad),
      estado: 'ACTIVO'
    };

    if (editId) {
      const { error } = await supabase.from('pacientes_motor').update(payload).eq('id_paciente', editId);
      if (error) return alert("Error: " + error.message);
    } else {
      const { error } = await supabase.from('pacientes_motor').insert([payload]);
      if (error) return alert("Error: " + error.message);
    }

    setForm({ nombre: '', dni: '', domicilio: '', escuela: '', telefono: '', obra_social: '', diagnostico: '' });
    setDia(''); setMes(''); setAnio('');
    setEditId(null);
    cargarPacientes();
  }

  return (
    <div style={{ color: '#fff', padding: '20px', position: 'relative' }}>
      {aviso && (
        <div style={{ position: 'fixed', top: '20px', left: '10%', right: '10%', background: '#ff0055', color: '#fff', padding: '15px', borderRadius: '10px', textAlign: 'center', zIndex: 1000, fontWeight: 'bold' }}>
          ¡Por favor, utiliza el botón 'Volver' de la pantalla!
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
        <h2 style={{ color: '#00f2ff', margin: 0 }}>{editId ? '✏️ Editando Paciente' : '➕ Cargar nuevo paciente'}</h2>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button 
            onClick={() => setModalListadoAbierto(true)}
            style={{ 
              background: '#00f2ff', 
              color: '#000', 
              border: 'none', 
              padding: '10px 18px', 
              borderRadius: '8px', 
              cursor: 'pointer', 
              fontWeight: 'bold', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px',
              boxShadow: '0 2px 8px rgba(0, 242, 255, 0.3)',
              transition: 'transform 0.1s'
            }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            📋 Listado Pacientes Activos ({pacientesActivos.length})
          </button>
          <button 
            onClick={() => exportarExcelActivos()}
            style={{ 
              background: '#10b981', 
              color: '#fff', 
              border: 'none', 
              padding: '10px 18px', 
              borderRadius: '8px', 
              cursor: 'pointer', 
              fontWeight: 'bold', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px',
              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
              transition: 'transform 0.1s'
            }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            📥 Descargar Excel
          </button>
        </div>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px', background: '#1a1a1a', padding: '20px', borderRadius: '10px' }}>
        <input placeholder="Nombre Completo" value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} style={inputStyle} />
        <input placeholder="DNI" value={form.dni} onChange={e => setForm({...form, dni: e.target.value})} style={inputStyle} />
        
        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
          <input type="number" placeholder="Día" value={dia} onChange={e => setDia(e.target.value)} style={{...inputStyle, width: '30%'}} />
          <input type="number" placeholder="Mes" value={mes} onChange={e => setMes(e.target.value)} style={{...inputStyle, width: '30%'}} />
          <input type="number" placeholder="Año" value={anio} onChange={e => setAnio(e.target.value)} style={{...inputStyle, width: '40%'}} />
        </div>

        <input placeholder="Domicilio" value={form.domicilio} onChange={e => setForm({...form, domicilio: e.target.value})} style={inputStyle} />
        <input placeholder="Escuela" value={form.escuela} onChange={e => setForm({...form, escuela: e.target.value})} style={inputStyle} />
        <input placeholder="Teléfono" value={form.telefono} onChange={e => setForm({...form, telefono: e.target.value})} style={inputStyle} />
        <input placeholder="Obra Social" value={form.obra_social} onChange={e => setForm({...form, obra_social: e.target.value})} style={inputStyle} />
        <input placeholder="Diagnóstico" value={form.diagnostico} onChange={e => setForm({...form, diagnostico: e.target.value})} style={inputStyle} />
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <button onClick={guardarPaciente} style={btnStyle}>{editId ? 'ACTUALIZAR DATOS' : 'GUARDAR PACIENTE'}</button>
        {editId && <button onClick={() => { setEditId(null); setForm({nombre: '', dni: '', domicilio: '', escuela: '', telefono: '', obra_social: '', diagnostico: ''}); setDia(''); setMes(''); setAnio(''); }} style={{...btnStyle, borderColor: '#666', color: '#ccc'}}>CANCELAR</button>}
      </div>

      <h3 style={{ marginTop: '30px', color: '#00f2ff' }}>Buscador de Pacientes</h3>
      <input 
        placeholder="🔍 Escriba un nombre o DNI para empezar a buscar..." 
        value={busqueda} 
        onChange={e => setBusqueda(e.target.value)} 
        style={{...inputStyle, width: '100%', marginBottom: '15px', borderColor: '#00f2ff'}} 
      />

      {busqueda.trim() !== '' && (
        <div style={{ width: '100%', marginTop: '20px' }}>
          {pacientesFiltrados.map(p => (
            <div key={p.id} onClick={() => setPacienteSeleccionado(p)} style={cardStyle}>
              <div style={{ fontWeight: 'bold', color: '#00f2ff' }}>{p.nombre}</div>
              <div style={{ fontSize: '0.8rem' }}>DNI: {p.dni}</div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Ficha Vertical */}
      {pacienteSeleccionado && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <h2 style={{ color: '#00f2ff', marginTop: 0 }}>Ficha del Paciente</h2>
            <div style={{ textAlign: 'left', lineHeight: '1.8' }}>
              <p><strong>Nombre:</strong> {pacienteSeleccionado.nombre}</p>
              <p><strong>DNI:</strong> {pacienteSeleccionado.dni}</p>
              <p><strong>Edad:</strong> {pacienteSeleccionado.edad}</p>
              <p><strong>Fecha Nac:</strong> {pacienteSeleccionado.fecha_nacimiento}</p>
              <p><strong>Teléfono:</strong> {pacienteSeleccionado.telefono}</p>
              <p><strong>Escuela:</strong> {pacienteSeleccionado.escuela}</p>
              <p><strong>Obra Social:</strong> {pacienteSeleccionado.obra_social}</p>
              <p><strong>Diagnóstico:</strong> {pacienteSeleccionado.diagnostico}</p>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button onClick={() => iniciarEdicion(pacienteSeleccionado)} style={btnStyle}>EDITAR</button>
              <button onClick={() => setPacienteSeleccionado(null)} style={{...btnStyle, borderColor: '#666', color: '#ccc'}}>CERRAR</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Listado Completo de Pacientes Activos */}
      {modalListadoAbierto && (
        <div style={overlayStyle}>
          <div style={{ ...modalStyle, maxWidth: '1100px', width: '95%', background: '#0f172a', border: '1px solid #00f2ff', padding: '25px', borderRadius: '16px' }}>
            
            {/* Header del Modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: '15px', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h2 style={{ color: '#00f2ff', margin: 0, fontSize: '22px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  📋 Listado de Pacientes Activos
                  <span style={{ fontSize: '13px', background: '#0284c7', color: '#fff', padding: '3px 10px', borderRadius: '20px', fontWeight: 'bold' }}>
                    {pacientesListadoFiltrados.length} de {pacientesActivos.length}
                  </span>
                </h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
                  Padrón oficial de pacientes con estado ACTIVO en Sistema Crin
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  onClick={() => exportarExcelActivos(pacientesListadoFiltrados)}
                  style={{ background: '#10b981', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  📥 Descargar Excel
                </button>
                <button 
                  onClick={() => window.print()}
                  style={{ background: '#334155', color: '#fff', border: '1px solid #475569', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
                >
                  🖨️ Imprimir
                </button>
                <button 
                  onClick={() => setModalListadoAbierto(false)}
                  style={{ background: '#dc2626', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
                >
                  ✕ Cerrar
                </button>
              </div>
            </div>

            {/* Filtros */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '15px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '240px' }}>
                <input 
                  type="text" 
                  placeholder="🔍 Buscar por nombre, DNI, diagnóstico u obra social..."
                  value={filtroListado}
                  onChange={(e) => setFiltroListado(e.target.value)}
                  style={{ ...inputStyle, width: '100%', borderColor: '#00f2ff' }}
                />
              </div>
              <div style={{ minWidth: '200px' }}>
                <select 
                  value={filtroObraSocial}
                  onChange={(e) => setFiltroObraSocial(e.target.value)}
                  style={{ ...inputStyle, width: '100%', borderColor: '#475569', cursor: 'pointer' }}
                >
                  <option value="TODAS">Todas las Obras Sociales ({listaObrasSociales.length})</option>
                  {listaObrasSociales.map(os => (
                    <option key={os} value={os}>{os}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tabla de Pacientes */}
            <div style={{ overflowX: 'auto', maxHeight: '55vh', border: '1px solid #334155', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#1e293b', color: '#00f2ff', zIndex: 1, borderBottom: '2px solid #334155' }}>
                  <tr>
                    <th style={{ padding: '10px 8px', width: '35px' }}>#</th>
                    <th style={{ padding: '10px 8px', width: '50px' }}>ID</th>
                    <th style={{ padding: '10px 8px' }}>Nombre y Apellido</th>
                    <th style={{ padding: '10px 8px' }}>DNI</th>
                    <th style={{ padding: '10px 8px' }}>Edad</th>
                    <th style={{ padding: '10px 8px' }}>Obra Social</th>
                    <th style={{ padding: '10px 8px' }}>Diagnóstico</th>
                    <th style={{ padding: '10px 8px' }}>Teléfono</th>
                    <th style={{ padding: '10px 8px' }}>Domicilio</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center' }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {pacientesListadoFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan="10" style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                        No se encontraron pacientes activos con los filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    pacientesListadoFiltrados.map((p, idx) => (
                      <tr key={p.id_paciente || p.id || idx} style={{ borderBottom: '1px solid #1e293b', background: idx % 2 === 0 ? '#0b1329' : '#0f172a' }}>
                        <td style={{ padding: '8px', color: '#64748b', fontSize: '11px' }}>{idx + 1}</td>
                        <td style={{ padding: '8px', color: '#94a3b8', fontWeight: 'bold' }}>{p.id_paciente || p.id}</td>
                        <td style={{ padding: '8px', fontWeight: 'bold', color: '#f8fafc' }}>
                          {p.nombre_apellido || p.nombre}
                        </td>
                        <td style={{ padding: '8px', color: '#cbd5e1' }}>{p.dni || '-'}</td>
                        <td style={{ padding: '8px', color: '#cbd5e1' }}>{p.edad ? `${p.edad} años` : '-'}</td>
                        <td style={{ padding: '8px' }}>
                          <span style={{ background: '#1e293b', color: '#00f2ff', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600' }}>
                            {p.obra_social || 'Particular'}
                          </span>
                        </td>
                        <td style={{ padding: '8px', color: '#94a3b8', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.diagnostico}>
                          {p.diagnostico || '-'}
                        </td>
                        <td style={{ padding: '8px', color: '#cbd5e1' }}>{p.tel_padres || p.telefono || '-'}</td>
                        <td style={{ padding: '8px', color: '#94a3b8', maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.domicilio}>
                          {p.domicilio || '-'}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <button 
                            onClick={() => {
                              iniciarEdicion(p);
                              setModalListadoAbierto(false);
                            }}
                            style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
                          >
                            ✏️ Editar
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}

const inputStyle = { padding: '12px', borderRadius: '8px', border: '1px solid #444', background: '#000', color: '#fff', boxSizing: 'border-box' };
const btnStyle = { padding: '15px', background: 'transparent', border: '1px solid #00f2ff', color: '#00f2ff', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' };
const cardStyle = { background: '#1a1a1a', padding: '15px', borderRadius: '8px', marginBottom: '10px', border: '1px solid #333', cursor: 'pointer' };

const overlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '20px' };
const modalStyle = { background: '#1a1a1a', padding: '25px', borderRadius: '15px', width: '100%', maxWidth: '400px', color: '#fff', border: '1px solid #00f2ff', maxHeight: '90vh', overflowY: 'auto' };

export default GestionPacientes;