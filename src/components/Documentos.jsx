import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export default function Documentos({ pacientePreseleccionado = null, onVolver = null, esEmbebido = false }) {
  // Estados de Pacientes
  const [pacientes, setPacientes] = useState([]);
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState(pacientePreseleccionado);
  const [busqueda, setBusqueda] = useState('');
  const [cargandoPacientes, setCargandoPacientes] = useState(false);

  // Estados de Archivos del Paciente
  const [archivos, setArchivos] = useState([]);
  const [cargandoArchivos, setCargandoArchivos] = useState(false);

  // Estados de Formulario de Carga
  const [archivoAsubir, setArchivoAsubir] = useState(null);
  const [tipoPreset, setTipoPreset] = useState('');
  const [nombreArchivoPersonalizado, setNombreArchivoPersonalizado] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [progresoSubida, setProgresoSubida] = useState('');
  const [mensajeEstado, setMensajeEstado] = useState(null); // { tipo: 'exito' | 'error', texto: '' }
  const [arrastrando, setArrastrando] = useState(false);
  const fileInputRef = useRef(null);

  // Estados para Modal de Previsualización y Eliminación
  const [modalPreview, setModalPreview] = useState(null); // { url, nombre, tipo }
  const [docAEliminar, setDocAEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);

  // Cargar lista de pacientes al montar (si no viene un paciente fijo preseleccionado)
  useEffect(() => {
    if (pacientePreseleccionado) {
      setPacienteSeleccionado(pacientePreseleccionado);
    } else {
      cargarPacientes();
    }
  }, [pacientePreseleccionado]);

  const cargarPacientes = async () => {
    setCargandoPacientes(true);
    try {
      const { data, error } = await supabase
        .from('pacientes_motor')
        .select('id_paciente, nombre_apellido, dni, obra_social')
        .order('nombre_apellido', { ascending: true });

      if (error) throw error;
      const mapped = (data || []).map(p => ({
        id_paciente_excel: p.id_paciente,
        nombre: p.nombre_apellido,
        dni: p.dni || '',
        obra_social: p.obra_social || ''
      }));
      setPacientes(mapped);
    } catch (e) {
      console.error("Error al cargar pacientes:", e);
    } finally {
      setCargandoPacientes(false);
    }
  };

  // Cargar documentos del paciente seleccionado
  const fetchArchivos = useCallback(async () => {
    const pId = pacienteSeleccionado?.id_paciente_excel || pacienteSeleccionado?.id_paciente || pacienteSeleccionado?.id;
    if (!pId) {
      setArchivos([]);
      return;
    }

    setCargandoArchivos(true);
    try {
      const { data, error } = await supabase
        .from('documentos_pacientes')
        .select('*')
        .eq('id_paciente_excel', pId)
        .order('fecha_subida', { ascending: false });

      if (error) throw error;
      setArchivos(data || []);
    } catch (err) {
      console.error("Error al obtener documentos del paciente:", err);
      setMensajeEstado({ tipo: 'error', texto: `Error al cargar documentos: ${err.message}` });
    } finally {
      setCargandoArchivos(false);
    }
  }, [pacienteSeleccionado]);

  useEffect(() => {
    fetchArchivos();
  }, [fetchArchivos]);

  // Manejar selección de archivo local
  const onFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    procesarArchivoSeleccionado(file);
  };

  const procesarArchivoSeleccionado = (file) => {
    // Validar tamaño máximo: 30 MB
    if (file.size > 30 * 1024 * 1024) {
      alert("El archivo supera el límite de 30 MB. Por favor optimice el archivo antes de subirlo.");
      return;
    }
    setArchivoAsubir(file);
    setMensajeEstado(null);

    // Sugerir nombre si está vacío
    const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    if (!nombreArchivoPersonalizado && !tipoPreset) {
      setNombreArchivoPersonalizado(baseName);
    }
  };

  // Manejar Drag & Drop
  const onDragOver = (e) => {
    e.preventDefault();
    setArrastrando(true);
  };
  const onDragLeave = () => {
    setArrastrando(false);
  };
  const onDrop = (e) => {
    e.preventDefault();
    setArrastrando(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      procesarArchivoSeleccionado(e.dataTransfer.files[0]);
    }
  };

  // Limpiar formulario de subida
  const resetFormularioSubida = () => {
    setArchivoAsubir(null);
    setTipoPreset('');
    setNombreArchivoPersonalizado('');
    setProgresoSubida('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Subir archivo a Supabase Storage y registrar en la tabla
  const handleSubirDocumento = async () => {
    const pId = pacienteSeleccionado?.id_paciente_excel || pacienteSeleccionado?.id_paciente || pacienteSeleccionado?.id;
    if (!pId) {
      alert("Por favor seleccione un paciente primero.");
      return;
    }
    if (!archivoAsubir) {
      alert("Por favor seleccione un archivo para subir.");
      return;
    }

    setSubiendo(true);
    setMensajeEstado(null);

    try {
      // 1. Determinar el nombre final visible del documento
      let tituloFinal = nombreArchivoPersonalizado.trim();
      if (tipoPreset && !tituloFinal) {
        tituloFinal = tipoPreset;
      } else if (!tituloFinal) {
        tituloFinal = archivoAsubir.name.substring(0, archivoAsubir.name.lastIndexOf('.')) || archivoAsubir.name;
      }

      // 2. Normalizar el nombre físico para Supabase Storage (sin caracteres conflictivos)
      const extension = (archivoAsubir.name.split('.').pop() || 'pdf').toLowerCase();
      const baseLimpia = tituloFinal
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .substring(0, 50);
      const timestamp = Date.now();
      const storagePath = `${pId}/${baseLimpia}_${timestamp}.${extension}`;

      setProgresoSubida("1/2 Subiendo archivo a Supabase Storage...");

      // 3. Subir archivo a bucket 'documentos_pacientes'
      const { data: storageData, error: storageErr } = await supabase.storage
        .from('documentos_pacientes')
        .upload(storagePath, archivoAsubir, {
          cacheControl: '3600',
          upsert: true,
          contentType: archivoAsubir.type || undefined
        });

      if (storageErr) {
        throw new Error(`Error en Storage: ${storageErr.message}`);
      }

      setProgresoSubida("2/2 Registrando documento en el sistema...");

      // 4. Insertar fila en 'documentos_pacientes'
      const { error: dbErr } = await supabase
        .from('documentos_pacientes')
        .insert([{
          id_paciente_excel: pId,
          nombre_archivo: tituloFinal,
          url_storage: storagePath,
          fecha_subida: new Date().toISOString()
        }]);

      if (dbErr) {
        // Si falló el registro en DB, intentamos limpiar el archivo subido
        await supabase.storage.from('documentos_pacientes').remove([storagePath]);
        throw new Error(`Error al guardar en base de datos: ${dbErr.message}`);
      }

      setMensajeEstado({
        tipo: 'exito',
        texto: `¡Documento "${tituloFinal}" subido y guardado exitosamente!`
      });

      resetFormularioSubida();
      await fetchArchivos();
    } catch (err) {
      console.error("Error al subir documento:", err);
      setMensajeEstado({
        tipo: 'error',
        texto: `No se pudo completar la subida: ${err.message}`
      });
    } finally {
      setSubiendo(false);
      setProgresoSubida('');
    }
  };

  // Eliminar documento (Storage + Base de Datos)
  const handleEliminarDocumento = async () => {
    if (!docAEliminar) return;
    setEliminando(true);

    try {
      // 1. Eliminar archivo físico de Supabase Storage si no es un JSON virtual
      if (docAEliminar.url_storage && !docAEliminar.url_storage.startsWith('JSON:')) {
        const { error: storageErr } = await supabase.storage
          .from('documentos_pacientes')
          .remove([docAEliminar.url_storage]);
        if (storageErr) console.warn("Aviso al remover de storage:", storageErr);
      }

      // 2. Eliminar fila de la tabla documentos_pacientes
      const { error: dbErr } = await supabase
        .from('documentos_pacientes')
        .delete()
        .eq('id', docAEliminar.id);

      if (dbErr) throw dbErr;

      setMensajeEstado({
        tipo: 'exito',
        texto: `Documento "${docAEliminar.nombre_archivo}" eliminado correctamente.`
      });

      setDocAEliminar(null);
      await fetchArchivos();
    } catch (err) {
      console.error("Error al eliminar documento:", err);
      alert("Error al eliminar documento: " + err.message);
    } finally {
      setEliminando(false);
    }
  };

  // Filtro dinámico de pacientes
  const pacientesFiltrados = pacientes.filter(p => {
    if (!busqueda) return true;
    const q = busqueda.toLowerCase().trim();
    return (
      (p.nombre && p.nombre.toLowerCase().includes(q)) ||
      (p.dni && String(p.dni).includes(q)) ||
      (p.obra_social && p.obra_social.toLowerCase().includes(q)) ||
      String(p.id_paciente_excel).includes(q)
    );
  });

  // Helper para construir la URL pública o visor
  const resolverUrlDocumento = (doc) => {
    if (!doc?.url_storage) return '';
    if (doc.url_storage.startsWith('JSON:')) {
      return `${window.location.origin}/?presupuesto=${doc.id}`;
    }
    return `https://gqhfrzvtccxrixdtazzs.supabase.co/storage/v1/object/public/documentos_pacientes/${doc.url_storage}`;
  };

  // Helper para obtener icono según tipo de archivo
  const getIconoDocumento = (url = '', nombre = '') => {
    const ext = (url.split('.').pop() || '').toLowerCase();
    if (url.startsWith('JSON:')) return '📊';
    if (['pdf'].includes(ext)) return '📕';
    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return '🖼️';
    if (['doc', 'docx'].includes(ext)) return '📘';
    if (nombre.toLowerCase().includes('cud')) return '♿';
    if (nombre.toLowerCase().includes('historia')) return '📋';
    return '📄';
  };

  return (
    <div style={{
      color: '#f8fafc',
      fontFamily: 'Segoe UI, -apple-system, BlinkMacSystemFont, Roboto, sans-serif',
      maxWidth: esEmbebido ? '100%' : '1100px',
      margin: '0 auto',
      padding: esEmbebido ? '10px 0' : '20px'
    }}>
      {/* Header superior */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#0f172a',
        padding: '16px 20px',
        borderRadius: '16px',
        border: '1px solid #1e293b',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>📁</span> Gestión de Documentos de Pacientes
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
            Historias clínicas, certificados CUD, órdenes médicas y estudios adjuntos en Supabase
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          {onVolver && (
            <button
              onClick={onVolver}
              style={{
                background: '#334155',
                color: '#fff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '13px'
              }}
            >
              ← Volver
            </button>
          )}
          {pacienteSeleccionado && (
            <button
              onClick={fetchArchivos}
              disabled={cargandoArchivos}
              style={{
                background: '#0284c7',
                color: '#fff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {cargandoArchivos ? '🔄 Cargando...' : '🔄 Refrescar'}
            </button>
          )}
        </div>
      </div>

      {/* Mensajes de Alerta */}
      {mensajeEstado && (
        <div style={{
          padding: '14px 20px',
          borderRadius: '10px',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: mensajeEstado.tipo === 'exito' ? '#064e3b' : '#450a0a',
          border: `1px solid ${mensajeEstado.tipo === 'exito' ? '#10b981' : '#ef4444'}`,
          color: mensajeEstado.tipo === 'exito' ? '#a7f3d0' : '#fecaca',
          fontSize: '13px',
          fontWeight: '500'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>{mensajeEstado.tipo === 'exito' ? '✅' : '⚠️'}</span>
            <span>{mensajeEstado.texto}</span>
          </div>
          <button
            onClick={() => setMensajeEstado(null)}
            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '16px' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Selector / Buscador de Pacientes (si no viene preseleccionado desde la Ficha) */}
      {!pacientePreseleccionado && (
        <div style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '16px',
          padding: '20px',
          marginBottom: '20px'
        }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#94a3b8', marginBottom: '8px' }}>
            👤 SELECCIONE EL PACIENTE:
          </label>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '280px' }}>
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="🔍 Escriba nombre, apellido o DNI del paciente..."
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  background: '#0f172a',
                  border: '1px solid #475569',
                  color: '#fff',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <div style={{ flex: 1.5, minWidth: '280px' }}>
              <select
                value={pacienteSeleccionado?.id_paciente_excel || ''}
                onChange={(e) => {
                  const p = pacientes.find(x => String(x.id_paciente_excel) === String(e.target.value));
                  setPacienteSeleccionado(p || null);
                  setMensajeEstado(null);
                }}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  background: '#0f172a',
                  border: '1px solid #38bdf8',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: '600',
                  outline: 'none',
                  boxSizing: 'border-box',
                  cursor: 'pointer'
                }}
              >
                <option value="">-- Seleccione de la lista ({pacientesFiltrados.length} encontrados) --</option>
                {pacientesFiltrados.map(p => (
                  <option key={p.id_paciente_excel} value={p.id_paciente_excel}>
                    {p.nombre} {p.dni ? `• DNI: ${p.dni}` : ''} {p.obra_social ? `• ${p.obra_social}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Si hay un paciente seleccionado, mostramos la ficha de carga y su lista de documentos */}
      {pacienteSeleccionado ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Tarjeta Informativa del Paciente Seleccionado */}
          <div style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            border: '1px solid #38bdf8',
            borderRadius: '14px',
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px'
          }}>
            <div>
              <span style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Expediente Digital del Paciente
              </span>
              <h3 style={{ margin: '4px 0 0 0', fontSize: '19px', color: '#f8fafc' }}>
                👤 {pacienteSeleccionado.nombre_apellido || pacienteSeleccionado.nombre}
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
                ID Sistema: <strong style={{ color: '#fff' }}>#{pacienteSeleccionado.id_paciente || pacienteSeleccionado.id_paciente_excel || pacienteSeleccionado.id}</strong>
                {pacienteSeleccionado.dni && ` • DNI: ${pacienteSeleccionado.dni}`}
                {pacienteSeleccionado.obra_social && ` • Obra Social: ${pacienteSeleccionado.obra_social}`}
              </p>
            </div>

            <div style={{ textAlign: 'right' }}>
              <span style={{
                background: archivos.length > 0 ? '#0284c7' : '#334155',
                color: '#fff',
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '13px',
                fontWeight: 'bold',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                📁 {archivos.length} Documento{archivos.length !== 1 ? 's' : ''} Guardado{archivos.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* ========================================================= */}
          {/* ZONA DE CARGA DE NUEVOS DOCUMENTOS                       */}
          {/* ========================================================= */}
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)'
          }}>
            <h4 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📤</span> Adjuntar Nuevo Documento
            </h4>

            {/* Presets rápidos de tipo de documento */}
            <div style={{ marginBottom: '16px' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>
                ETIQUETA RÁPIDA (Opcional):
              </span>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {[
                  { label: 'Historia Clínica', icon: '📋' },
                  { label: 'Certificado CUD', icon: '♿' },
                  { label: 'Orden Médica', icon: '📝' },
                  { label: 'DNI / Identificación', icon: '🆔' },
                  { label: 'Informe de Fonoaudiología', icon: '🗣️' },
                  { label: 'Informe de Kinesiología', icon: '🏃' },
                  { label: 'Informe de Psicología', icon: '🧠' }
                ].map(p => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      setTipoPreset(p.label);
                      setNombreArchivoPersonalizado(p.label);
                    }}
                    style={{
                      background: tipoPreset === p.label ? '#0284c7' : '#0f172a',
                      color: tipoPreset === p.label ? '#fff' : '#cbd5e1',
                      border: `1px solid ${tipoPreset === p.label ? '#38bdf8' : '#334155'}`,
                      padding: '5px 12px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      transition: 'all 0.15s'
                    }}
                  >
                    <span>{p.icon}</span> {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Nombre descriptivo del archivo */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', fontWeight: 'bold', marginBottom: '6px' }}>
                TÍTULO / DESCRIPCIÓN DEL ARCHIVO:
              </label>
              <input
                type="text"
                value={nombreArchivoPersonalizado}
                onChange={(e) => setNombreArchivoPersonalizado(e.target.value)}
                placeholder="Ej: Historia Clínica 2026, CUD Vigente, Evaluación Neurocognitiva..."
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: '#0f172a',
                  border: '1px solid #475569',
                  color: '#fff',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  outline: 'none'
                }}
              />
            </div>

            {/* Zona Dropzone para arrastrar o examinar archivo */}
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              style={{
                border: `2px dashed ${arrastrando ? '#38bdf8' : archivoAsubir ? '#10b981' : '#475569'}`,
                background: arrastrando ? '#082f49' : archivoAsubir ? '#064e3b20' : '#0f172a',
                borderRadius: '12px',
                padding: '30px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s',
                marginBottom: '16px'
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                onChange={onFileChange}
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.webp"
                style={{ display: 'none' }}
              />

              {archivoAsubir ? (
                <div>
                  <span style={{ fontSize: '36px' }}>
                    {getIconoDocumento(archivoAsubir.name, archivoAsubir.name)}
                  </span>
                  <p style={{ margin: '8px 0 2px 0', fontSize: '15px', fontWeight: 'bold', color: '#10b981' }}>
                    {archivoAsubir.name}
                  </p>
                  <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                    Tamaño: {(archivoAsubir.size / (1024 * 1024)).toFixed(2)} MB • Tipo: {archivoAsubir.type || 'Documento'}
                  </p>
                  <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#38bdf8', textDecoration: 'underline' }}>
                    Haga clic o arrastre otro para cambiarlo
                  </p>
                </div>
              ) : (
                <div>
                  <span style={{ fontSize: '36px' }}>📄</span>
                  <p style={{ margin: '8px 0 2px 0', fontSize: '14px', fontWeight: 'bold', color: '#cbd5e1' }}>
                    Arrastre el archivo aquí o <span style={{ color: '#38bdf8', textDecoration: 'underline' }}>haga clic para examinar</span>
                  </p>
                  <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                    Soporta: PDF, Imágenes (JPG, PNG), Word (DOC, DOCX) • Hasta 30 MB
                  </p>
                </div>
              )}
            </div>

            {/* Barra / Mensaje de Progreso de Subida */}
            {subiendo && (
              <div style={{
                background: '#0284c7',
                color: '#fff',
                padding: '12px 16px',
                borderRadius: '8px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '13px',
                fontWeight: 'bold'
              }}>
                <span>⏳</span> {progresoSubida || 'Subiendo archivo...'}
              </div>
            )}

            {/* Botón de Confirmación de Subida */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              {archivoAsubir && (
                <button
                  type="button"
                  onClick={resetFormularioSubida}
                  disabled={subiendo}
                  style={{
                    background: '#334155',
                    color: '#cbd5e1',
                    border: 'none',
                    padding: '10px 18px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 'bold'
                  }}
                >
                  Cancelar
                </button>
              )}
              <button
                type="button"
                onClick={handleSubirDocumento}
                disabled={subiendo || !archivoAsubir}
                style={{
                  background: subiendo || !archivoAsubir 
                    ? '#475569' 
                    : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 24px',
                  borderRadius: '8px',
                  cursor: subiendo || !archivoAsubir ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: subiendo || !archivoAsubir ? 'none' : '0 4px 12px rgba(16,185,129,0.35)'
                }}
              >
                <span>📤</span> {subiendo ? 'Subiendo...' : 'Guardar y Subir Documento'}
              </button>
            </div>
          </div>

          {/* ========================================================= */}
          {/* LISTA DE DOCUMENTOS EXISTENTES                           */}
          {/* ========================================================= */}
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '16px',
            padding: '24px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h4 style={{ margin: 0, fontSize: '16px', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📚</span> Documentos Registrados ({archivos.length})
              </h4>
              <button
                onClick={fetchArchivos}
                disabled={cargandoArchivos}
                style={{
                  background: 'transparent',
                  border: '1px solid #475569',
                  color: '#94a3b8',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                🔄 Actualizar
              </button>
            </div>

            {cargandoArchivos ? (
              <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                <p>Cargando documentos del paciente...</p>
              </div>
            ) : archivos.length === 0 ? (
              <div style={{
                background: '#0f172a',
                border: '1px dashed #334155',
                borderRadius: '12px',
                padding: '40px 20px',
                textAlign: 'center',
                color: '#94a3b8'
              }}>
                <span style={{ fontSize: '40px', display: 'block', marginBottom: '10px' }}>📭</span>
                <p style={{ margin: 0, fontSize: '14px', fontWeight: 'bold' }}>
                  Aún no hay documentos registrados para este paciente.
                </p>
                <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                  Utilice la sección superior para adjuntar el primer archivo (PDF, CUD, DNI, etc.).
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {archivos.map((doc, idx) => {
                  const urlPublica = resolverUrlDocumento(doc);
                  const isJson = doc.url_storage && doc.url_storage.startsWith('JSON:');
                  const fechaStr = doc.fecha_subida 
                    ? new Date(doc.fecha_subida).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) 
                    : 'Fecha no registrada';

                  return (
                    <div
                      key={doc.id || idx}
                      style={{
                        background: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '12px',
                        padding: '14px 18px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '12px',
                        transition: 'border-color 0.15s'
                      }}
                    >
                      {/* Información del archivo */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: '240px' }}>
                        <span style={{ fontSize: '28px' }}>
                          {getIconoDocumento(doc.url_storage, doc.nombre_archivo)}
                        </span>
                        <div>
                          <a
                            href={urlPublica}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: '#38bdf8',
                              textDecoration: 'none',
                              fontSize: '15px',
                              fontWeight: 'bold',
                              display: 'block'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.textDecoration = 'underline'}
                            onMouseOut={(e) => e.currentTarget.style.textDecoration = 'none'}
                          >
                            {doc.nombre_archivo}
                          </a>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', fontSize: '12px', color: '#94a3b8' }}>
                            <span>📅 {fechaStr}</span>
                            <span>•</span>
                            <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#64748b' }}>
                              {doc.url_storage}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Botones de acción */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {/* Ver / Previsualizar */}
                        <button
                          type="button"
                          onClick={() => {
                            if (isJson) {
                              window.open(urlPublica, '_blank');
                            } else {
                              const ext = (doc.url_storage.split('.').pop() || '').toLowerCase();
                              if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
                                setModalPreview({ url: urlPublica, nombre: doc.nombre_archivo, tipo: 'imagen' });
                              } else if (ext === 'pdf') {
                                setModalPreview({ url: urlPublica, nombre: doc.nombre_archivo, tipo: 'pdf' });
                              } else {
                                window.open(`https://docs.google.com/viewer?url=${encodeURIComponent(urlPublica)}&embedded=true`, '_blank');
                              }
                            }
                          }}
                          style={{
                            background: '#0284c7',
                            color: '#fff',
                            border: 'none',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          👁️ Ver
                        </button>

                        {/* Descargar */}
                        <a
                          href={urlPublica}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={doc.nombre_archivo}
                          style={{
                            background: '#334155',
                            color: '#cbd5e1',
                            textDecoration: 'none',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          ⬇️ Descargar
                        </a>

                        {/* Eliminar */}
                        <button
                          type="button"
                          onClick={() => setDocAEliminar(doc)}
                          style={{
                            background: '#450a0a',
                            color: '#f87171',
                            border: '1px solid #7f1d1d',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 'bold'
                          }}
                          title="Eliminar este documento"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* ========================================================= */}
      {/* MODAL DE PREVISUALIZACIÓN DIRECTA                         */}
      {/* ========================================================= */}
      {modalPreview && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 100000,
          padding: '20px'
        }}>
          <div style={{
            background: '#0f172a',
            border: '1px solid #38bdf8',
            borderRadius: '16px',
            maxWidth: '900px',
            width: '100%',
            height: '85vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '14px 20px',
              borderBottom: '1px solid #334155',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#1e293b'
            }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📄</span> {modalPreview.nombre}
              </h3>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <a
                  href={modalPreview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#38bdf8', fontSize: '13px', textDecoration: 'underline' }}
                >
                  Abrir en pestaña nueva ↗
                </a>
                <button
                  onClick={() => setModalPreview(null)}
                  style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>
            </div>

            <div style={{ flex: 1, background: '#020617', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'auto' }}>
              {modalPreview.tipo === 'imagen' ? (
                <img
                  src={modalPreview.url}
                  alt={modalPreview.nombre}
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                />
              ) : (
                <iframe
                  src={modalPreview.url}
                  title={modalPreview.nombre}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL DE CONFIRMACIÓN DE ELIMINACIÓN                      */}
      {/* ========================================================= */}
      {docAEliminar && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 100000,
          padding: '20px'
        }}>
          <div style={{
            background: '#1e293b',
            border: '1px solid #ef4444',
            borderRadius: '16px',
            maxWidth: '450px',
            width: '100%',
            padding: '24px',
            color: '#f8fafc'
          }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#f87171', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>⚠️</span> Confirmar Eliminación
            </h3>
            <p style={{ fontSize: '14px', color: '#cbd5e1', lineHeight: '1.5', margin: '0 0 16px 0' }}>
              ¿Estás seguro de que deseas eliminar permanentemente el documento:
              <br />
              <strong style={{ color: '#fff' }}>"{docAEliminar.nombre_archivo}"</strong>?
            </p>
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 20px 0' }}>
              Esta acción borrará el archivo de Supabase Storage y el registro contable asociado.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setDocAEliminar(null)}
                disabled={eliminando}
                style={{
                  background: '#334155',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '13px'
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleEliminarDocumento}
                disabled={eliminando}
                style={{
                  background: '#dc2626',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 18px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '13px'
                }}
              >
                {eliminando ? 'Eliminando...' : 'Sí, Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}