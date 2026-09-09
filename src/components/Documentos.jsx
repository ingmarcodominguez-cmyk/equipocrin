import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { PDFDocument } from 'pdf-lib';

export default function Documentos({ pacientePreseleccionado = null, onVolver = null, esEmbebido = false }) {
  // Estados de Pacientes
  const [pacientes, setPacientes] = useState([]);
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState(pacientePreseleccionado);
  const [busqueda, setBusqueda] = useState('');
  const [cargandoPacientes, setCargandoPacientes] = useState(false);

  // Estados de Archivos del Paciente
  const [archivos, setArchivos] = useState([]);
  const [cargandoArchivos, setCargandoArchivos] = useState(false);

  // Estados de Formulario de Carga Principal
  const [archivoAsubir, setArchivoAsubir] = useState(null);
  const [tipoPreset, setTipoPreset] = useState('');
  const [nombreArchivoPersonalizado, setNombreArchivoPersonalizado] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [progresoSubida, setProgresoSubida] = useState('');
  const [mensajeEstado, setMensajeEstado] = useState(null); // { tipo: 'exito' | 'error', texto: '' }
  const [arrastrando, setArrastrando] = useState(false);
  const fileInputRef = useRef(null);
  const listaDocsRef = useRef(null);

  // Estados para Modal de Previsualización y Eliminación
  const [modalPreview, setModalPreview] = useState(null); // { url, nombre, tipo }
  const [docAEliminar, setDocAEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);

  // Estados para Modal de "Adosar Hoja" (Merge PDF)
  const [modalAdosar, setModalAdosar] = useState(null); // { doc, archivo, posicion, guardarNuevo, tituloNuevo }
  const [arrastrandoAdosar, setArrastrandoAdosar] = useState(false);
  const [procesandoAdosar, setProcesandoAdosar] = useState(false);
  const [progresoAdosar, setProgresoAdosar] = useState('');
  const fileInputAdosarRef = useRef(null);

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

  // Manejar selección de archivo local en formulario principal
  const onFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    procesarArchivoSeleccionado(file);
  };

  const procesarArchivoSeleccionado = (file) => {
    if (file.size > 30 * 1024 * 1024) {
      alert("El archivo supera el límite de 30 MB. Por favor optimice el archivo antes de subirlo.");
      return;
    }
    setArchivoAsubir(file);
    setMensajeEstado(null);

    const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    if (!nombreArchivoPersonalizado && !tipoPreset) {
      setNombreArchivoPersonalizado(baseName);
    }
  };

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
      let tituloFinal = nombreArchivoPersonalizado.trim();
      if (tipoPreset && !tituloFinal) {
        tituloFinal = tipoPreset;
      } else if (!tituloFinal) {
        tituloFinal = archivoAsubir.name.substring(0, archivoAsubir.name.lastIndexOf('.')) || archivoAsubir.name;
      }

      const extension = (archivoAsubir.name.split('.').pop() || 'pdf').toLowerCase();
      const baseLimpia = tituloFinal
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .substring(0, 50);
      const timestamp = Date.now();
      const storagePath = `${pId}/${baseLimpia}_${timestamp}.${extension}`;

      setProgresoSubida("1/2 Subiendo archivo a Supabase Storage...");

      const { error: storageErr } = await supabase.storage
        .from('documentos_pacientes')
        .upload(storagePath, archivoAsubir, {
          cacheControl: '3600',
          upsert: false,
          contentType: archivoAsubir.type || undefined
        });

      if (storageErr) {
        throw new Error(`Error en Storage: ${storageErr.message}`);
      }

      setProgresoSubida("2/2 Registrando documento en el sistema...");

      const { error: dbErr } = await supabase
        .from('documentos_pacientes')
        .insert([{
          id_paciente_excel: pId,
          nombre_archivo: tituloFinal,
          url_storage: storagePath,
          fecha_subida: new Date().toISOString()
        }]);

      if (dbErr) {
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
      const esRls = (err.message || '').includes('row-level security');
      setMensajeEstado({
        tipo: 'error',
        texto: esRls 
          ? `Error de permisos en Storage (RLS). Por favor ejecute la política de acceso total en Supabase SQL Editor.` 
          : `No se pudo completar la subida: ${err.message}`
      });
    } finally {
      setSubiendo(false);
      setProgresoSubida('');
    }
  };

  // Convertir cualquier imagen local (incluso cámara de móvil o WebP) a JPEG binario compatible con pdf-lib
  const convertirImagenAJpegBytes = (file) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        // Rellenar fondo blanco por si tiene transparencias
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error("Error al procesar la imagen."));
          blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf))).catch(reject);
        }, 'image/jpeg', 0.92);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("No se pudo cargar la imagen para procesarla."));
      };
      img.src = url;
    });
  };

  // Ejecutar el adosado (PDF Merge)
  const handleConfirmarAdosar = async () => {
    if (!modalAdosar?.doc) return;
    if (!modalAdosar?.archivo) {
      alert("Por favor seleccione el archivo o foto que desea adosar.");
      return;
    }

    setProcesandoAdosar(true);
    setProgresoAdosar("1/4 Descargando documento original...");

    try {
      const docBase = modalAdosar.doc;
      const urlOriginal = resolverUrlDocumento(docBase);

      // 1. Descargar bytes del PDF original
      const resOriginal = await fetch(urlOriginal);
      if (!resOriginal.ok) throw new Error("No se pudo descargar el archivo PDF original de Supabase.");
      const bytesOriginal = await resOriginal.arrayBuffer();

      setProgresoAdosar("2/4 Cargando motor de documentos PDF...");
      const pdfPrincipal = await PDFDocument.load(bytesOriginal);

      // 2. Procesar el archivo que se va a adosar
      const archivoNuevo = modalAdosar.archivo;
      const ext = (archivoNuevo.name.split('.').pop() || '').toLowerCase();
      const esPdf = (ext === 'pdf');

      setProgresoAdosar("3/4 Anexando nuevas páginas...");

      if (esPdf) {
        // Leer el nuevo PDF y copiar todas sus páginas
        const bytesNuevo = await archivoNuevo.arrayBuffer();
        const pdfAdicional = await PDFDocument.load(bytesNuevo);
        const paginasCopiadas = await pdfPrincipal.copyPages(pdfAdicional, pdfAdicional.getPageIndices());

        if (modalAdosar.posicion === 'inicio') {
          // Insertar al inicio en orden
          paginasCopiadas.forEach((p, idx) => {
            pdfPrincipal.insertPage(idx, p);
          });
        } else {
          // Anexar al final
          paginasCopiadas.forEach(p => pdfPrincipal.addPage(p));
        }
      } else {
        // Es una imagen (foto de evolución, escaneo JPG, PNG, WebP)
        const jpegBytes = await convertirImagenAJpegBytes(archivoNuevo);
        const embeddedImg = await pdfPrincipal.embedJpg(jpegBytes);

        // Ajustar a tamaño A4 estándar proporcionalmente
        const A4_W = 595.28;
        const A4_H = 841.89;
        const MARGIN = 20;
        const maxW = A4_W - MARGIN * 2;
        const maxH = A4_H - MARGIN * 2;
        const scale = Math.min(maxW / embeddedImg.width, maxH / embeddedImg.height, 1);
        const drawW = embeddedImg.width * scale;
        const drawH = embeddedImg.height * scale;
        const posX = (A4_W - drawW) / 2;
        const posY = (A4_H - drawH) / 2;

        let nuevaPagina;
        if (modalAdosar.posicion === 'inicio') {
          nuevaPagina = pdfPrincipal.insertPage(0, [A4_W, A4_H]);
        } else {
          nuevaPagina = pdfPrincipal.addPage([A4_W, A4_H]);
        }

        nuevaPagina.drawImage(embeddedImg, {
          x: posX,
          y: posY,
          width: drawW,
          height: drawH
        });
      }

      setProgresoAdosar("4/4 Guardando documento unificado en Supabase...");
      const pdfFinalBytes = await pdfPrincipal.save();
      const totalPaginas = pdfPrincipal.getPageCount();

      // 3. Guardar en Supabase Storage
      const pId = pacienteSeleccionado?.id_paciente_excel || pacienteSeleccionado?.id_paciente || pacienteSeleccionado?.id;
      let targetPath = docBase.url_storage;

      if (modalAdosar.guardarNuevo) {
        // Guardar como copia nueva adicional
        const baseLimpia = (modalAdosar.tituloNuevo || `${docBase.nombre_archivo}_actualizado`)
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .substring(0, 50);
        targetPath = `${pId}/${baseLimpia}_${Date.now()}.pdf`;

        // Subir a Storage
        const { error: upErr } = await supabase.storage
          .from('documentos_pacientes')
          .upload(targetPath, pdfFinalBytes, {
            contentType: 'application/pdf',
            upsert: true
          });
        if (upErr) throw upErr;

        // Crear fila nueva en DB
        const { error: insErr } = await supabase
          .from('documentos_pacientes')
          .insert([{
            id_paciente_excel: pId,
            nombre_archivo: modalAdosar.tituloNuevo || `${docBase.nombre_archivo} (Adosado)`,
            url_storage: targetPath,
            fecha_subida: new Date().toISOString()
          }]);
        if (insErr) throw insErr;
      } else {
        // Sobrescribir el archivo actual (Mantiene la historia clínica unificada)
        const { error: upErr } = await supabase.storage
          .from('documentos_pacientes')
          .upload(targetPath, pdfFinalBytes, {
            contentType: 'application/pdf',
            upsert: true
          });
        if (upErr) throw upErr;

        // Actualizar fecha de subida en la base de datos
        await supabase
          .from('documentos_pacientes')
          .update({ fecha_subida: new Date().toISOString() })
          .eq('id', docBase.id);
      }

      setMensajeEstado({
        tipo: 'exito',
        texto: `¡Hoja adosada con éxito! El documento "${docBase.nombre_archivo}" ahora cuenta con ${totalPaginas} páginas.`
      });

      setModalAdosar(null);
      await fetchArchivos();
    } catch (err) {
      console.error("Error al adosar hoja:", err);
      alert("Error al adosar hoja al documento: " + err.message);
    } finally {
      setProcesandoAdosar(false);
      setProgresoAdosar('');
    }
  };

  // Eliminar documento (Storage + Base de Datos)
  const handleEliminarDocumento = async () => {
    if (!docAEliminar) return;
    setEliminando(true);

    try {
      if (docAEliminar.url_storage && !docAEliminar.url_storage.startsWith('JSON:')) {
        const { error: storageErr } = await supabase.storage
          .from('documentos_pacientes')
          .remove([docAEliminar.url_storage]);
        if (storageErr) console.warn("Aviso al remover de storage:", storageErr);
      }

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
      maxWidth: esEmbebido ? '100%' : '1400px',
      margin: '0 auto',
      padding: esEmbebido ? '8px 0' : '14px 20px'
    }}>
      {/* Header superior amplio y nítido */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#0f172a',
        padding: '12px 20px',
        borderRadius: '12px',
        border: '1px solid #1e293b',
        marginBottom: '12px',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>📁</span> Gestión de Documentos de Pacientes
          </h2>
          <p style={{ margin: '3px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
            Historias clínicas, CUD, órdenes médicas, informes profesionales y adosado de hojas
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {onVolver && (
            <button
              onClick={onVolver}
              style={{
                background: '#334155',
                color: '#fff',
                border: 'none',
                padding: '7px 15px',
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
                padding: '7px 16px',
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
          padding: '10px 16px',
          borderRadius: '10px',
          marginBottom: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: mensajeEstado.tipo === 'exito' ? '#064e3b' : '#450a0a',
          border: `1px solid ${mensajeEstado.tipo === 'exito' ? '#10b981' : '#ef4444'}`,
          color: mensajeEstado.tipo === 'exito' ? '#a7f3d0' : '#fecaca',
          fontSize: '13px',
          fontWeight: '500'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>{mensajeEstado.tipo === 'exito' ? '✅' : '⚠️'}</span>
            <span>{mensajeEstado.texto}</span>
          </div>
          <button
            onClick={() => setMensajeEstado(null)}
            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '15px' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Selector de Pacientes amplio (si no viene preseleccionado) */}
      {!pacientePreseleccionado && (
        <div style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '12px',
          padding: '12px 18px',
          marginBottom: '12px'
        }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: '240px' }}>
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="🔍 Filtrar por nombre, apellido o DNI del paciente..."
                style={{
                  width: '100%',
                  padding: '9px 14px',
                  borderRadius: '8px',
                  background: '#0f172a',
                  border: '1px solid #475569',
                  color: '#fff',
                  fontSize: '13px',
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
                  padding: '9px 14px',
                  borderRadius: '8px',
                  background: '#0f172a',
                  border: '1px solid #38bdf8',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: '600',
                  outline: 'none',
                  boxSizing: 'border-box',
                  cursor: 'pointer'
                }}
              >
                <option value="">-- Seleccione paciente ({pacientesFiltrados.length} encontrados) --</option>
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

      {/* Barra del Expediente del Paciente Seleccionado */}
      {pacienteSeleccionado && (
        <div style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          border: '1px solid #38bdf8',
          borderRadius: '12px',
          padding: '10px 18px',
          marginBottom: '14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#f8fafc' }}>
              👤 {pacienteSeleccionado.nombre_apellido || pacienteSeleccionado.nombre}
            </span>
            <span style={{
              background: '#0369a1',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 'bold',
              padding: '2px 8px',
              borderRadius: '6px'
            }}>
              ID #{pacienteSeleccionado.id_paciente || pacienteSeleccionado.id_paciente_excel || pacienteSeleccionado.id}
            </span>
            {pacienteSeleccionado.dni && (
              <span style={{ fontSize: '13px', color: '#cbd5e1' }}>• DNI: <strong>{pacienteSeleccionado.dni}</strong></span>
            )}
            {pacienteSeleccionado.obra_social && (
              <span style={{ fontSize: '13px', color: '#94a3b8' }}>• Obra Social: {pacienteSeleccionado.obra_social}</span>
            )}
          </div>

          <div
            onClick={() => {
              if (listaDocsRef.current) {
                listaDocsRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }
            }}
            style={{
              background: archivos.length > 0 ? '#0284c7' : '#334155',
              color: '#fff',
              padding: '5px 14px',
              borderRadius: '16px',
              fontSize: '13px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)'
            }}
            title="Ver los documentos guardados"
          >
            📁 {archivos.length} Documento{archivos.length !== 1 ? 's' : ''} Guardado{archivos.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* VISTA PRINCIPAL DIVIDIDA EN 2 COLUMNAS (AMPLIA Y CÓMODA)   */}
      {/* ========================================================= */}
      {pacienteSeleccionado ? (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px',
          alignItems: 'stretch'
        }}>
          {/* ========================================================= */}
          {/* COLUMNA 1: DOCUMENTOS REGISTRADOS (PRIORIDAD VISUAL)     */}
          {/* ========================================================= */}
          <div
            ref={listaDocsRef}
            style={{
              flex: '1.25 1 500px',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '14px',
              padding: '18px 20px',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: 'calc(100vh - 230px)',
              minHeight: '440px',
              boxSizing: 'border-box'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h4 style={{ margin: 0, fontSize: '16px', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📚</span> Documentos del Paciente ({archivos.length})
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
              <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                <p>Cargando documentos del paciente...</p>
              </div>
            ) : archivos.length === 0 ? (
              <div style={{
                background: '#0f172a',
                border: '1px dashed #334155',
                borderRadius: '12px',
                padding: '40px 20px',
                textAlign: 'center',
                color: '#94a3b8',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center'
              }}>
                <span style={{ fontSize: '38px', display: 'block', marginBottom: '10px' }}>📭</span>
                <p style={{ margin: 0, fontSize: '15px', fontWeight: 'bold' }}>
                  Aún no hay documentos para este paciente.
                </p>
                <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                  Utilice el panel lateral para adjuntar el primero (Historia Clínica, CUD, DNI, etc.).
                </p>
              </div>
            ) : (
              <div style={{
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                paddingRight: '6px'
              }}>
                {archivos.map((doc, idx) => {
                  const urlPublica = resolverUrlDocumento(doc);
                  const isJson = doc.url_storage && doc.url_storage.startsWith('JSON:');
                  const esPdf = (doc.url_storage || '').toLowerCase().endsWith('.pdf');
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
                        padding: '12px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        transition: 'all 0.15s'
                      }}
                    >
                      {/* Cabecera del Documento */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                        <span style={{ fontSize: '28px', flexShrink: 0 }}>
                          {getIconoDocumento(doc.url_storage, doc.nombre_archivo)}
                        </span>
                        <div style={{ minWidth: 0, overflow: 'hidden', flex: 1 }}>
                          <span
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
                              color: '#38bdf8',
                              fontSize: '14px',
                              fontWeight: 'bold',
                              display: 'block',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              cursor: 'pointer'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.textDecoration = 'underline'}
                            onMouseOut={(e) => e.currentTarget.style.textDecoration = 'none'}
                            title={doc.nombre_archivo}
                          >
                            {doc.nombre_archivo}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', fontSize: '12px', color: '#94a3b8' }}>
                            <span>📅 {fechaStr}</span>
                          </div>
                        </div>
                      </div>

                      {/* Botones de acción cómodos */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', paddingTop: '6px', borderTop: '1px solid #1e293b' }}>
                        
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
                            padding: '6px 14px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px'
                          }}
                        >
                          👁️ Ver
                        </button>

                        {/* BOTÓN ADOSAR HOJA (Solo si es PDF) */}
                        {esPdf && (
                          <button
                            type="button"
                            onClick={() => {
                              setModalAdosar({
                                doc,
                                archivo: null,
                                posicion: 'final',
                                guardarNuevo: false,
                                tituloNuevo: `${doc.nombre_archivo} (Actualizado)`
                              });
                            }}
                            style={{
                              background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                              color: '#fff',
                              border: '1px solid #8b5cf6',
                              padding: '6px 14px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: 'bold',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              boxShadow: '0 2px 6px rgba(124,58,237,0.3)'
                            }}
                            title="Anexar una o más hojas a este documento"
                          >
                            <span>➕</span> Adosar Hoja
                          </button>
                        )}

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
                            padding: '6px 14px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px'
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
                            fontWeight: 'bold',
                            marginLeft: 'auto'
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

          {/* ========================================================= */}
          {/* COLUMNA 2: ADJUNTAR NUEVO DOCUMENTO                       */}
          {/* ========================================================= */}
          <div style={{
            flex: '1 1 380px',
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '14px',
            padding: '18px 20px',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: 'calc(100vh - 230px)',
            minHeight: '440px',
            overflowY: 'auto'
          }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📤</span> Adjuntar Nuevo Documento
            </h4>

            {/* Presets rápidos de tipo de documento */}
            <div style={{ marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>
                ETIQUETA RÁPIDA:
              </span>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[
                  { label: 'Historia Clínica', icon: '📋' },
                  { label: 'CUD', icon: '♿' },
                  { label: 'Orden Médica', icon: '📝' },
                  { label: 'DNI', icon: '🆔' },
                  { label: 'Fono', icon: '🗣️' },
                  { label: 'Kinesio', icon: '🏃' },
                  { label: 'Psicología', icon: '🧠' }
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
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.15s'
                    }}
                  >
                    <span>{p.icon}</span> {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Nombre descriptivo del archivo */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', fontWeight: 'bold', marginBottom: '4px' }}>
                TÍTULO / DESCRIPCIÓN:
              </label>
              <input
                type="text"
                value={nombreArchivoPersonalizado}
                onChange={(e) => setNombreArchivoPersonalizado(e.target.value)}
                placeholder="Ej: Historia Clínica 2026, CUD Vigente..."
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  background: '#0f172a',
                  border: '1px solid #475569',
                  color: '#fff',
                  fontSize: '13px',
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
                borderRadius: '10px',
                padding: '22px 16px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s',
                marginBottom: '12px'
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
                  <span style={{ fontSize: '32px' }}>
                    {getIconoDocumento(archivoAsubir.name, archivoAsubir.name)}
                  </span>
                  <p style={{ margin: '6px 0 2px 0', fontSize: '14px', fontWeight: 'bold', color: '#10b981' }}>
                    {archivoAsubir.name}
                  </p>
                  <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                    {(archivoAsubir.size / (1024 * 1024)).toFixed(2)} MB • Clic para cambiar
                  </p>
                </div>
              ) : (
                <div>
                  <span style={{ fontSize: '30px' }}>📄</span>
                  <p style={{ margin: '6px 0 2px 0', fontSize: '14px', fontWeight: 'bold', color: '#cbd5e1' }}>
                    Arrastre el archivo aquí o <span style={{ color: '#38bdf8', textDecoration: 'underline' }}>examinar</span>
                  </p>
                  <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                    PDF, JPG, PNG, DOCX (hasta 30 MB)
                  </p>
                </div>
              )}
            </div>

            {/* Barra / Mensaje de Progreso de Subida */}
            {subiendo && (
              <div style={{
                background: '#0284c7',
                color: '#fff',
                padding: '8px 12px',
                borderRadius: '8px',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
                fontWeight: 'bold'
              }}>
                <span>⏳</span> {progresoSubida || 'Subiendo archivo...'}
              </div>
            )}

            {/* Botón de Confirmación de Subida */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: 'auto' }}>
              {archivoAsubir && (
                <button
                  type="button"
                  onClick={resetFormularioSubida}
                  disabled={subiendo}
                  style={{
                    background: '#334155',
                    color: '#cbd5e1',
                    border: 'none',
                    padding: '8px 16px',
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
                  padding: '9px 22px',
                  borderRadius: '8px',
                  cursor: subiendo || !archivoAsubir ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: subiendo || !archivoAsubir ? 'none' : '0 3px 10px rgba(16,185,129,0.35)'
                }}
              >
                <span>📤</span> {subiendo ? 'Subiendo...' : 'Guardar y Subir'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ========================================================= */}
      {/* MODAL PARA ADOSAR HOJA A DOCUMENTO EXISTENTE              */}
      {/* ========================================================= */}
      {modalAdosar && (
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
            border: '1px solid #8b5cf6',
            borderRadius: '16px',
            maxWidth: '580px',
            width: '100%',
            padding: '24px',
            color: '#f8fafc',
            boxShadow: '0 25px 50px -12px rgba(124, 58, 237, 0.35)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: '#c084fc', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>➕</span> Adosar Hoja / Estudio
              </h3>
              <button
                type="button"
                onClick={() => setModalAdosar(null)}
                disabled={procesandoAdosar}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ background: '#0f172a', padding: '12px 16px', borderRadius: '10px', marginBottom: '16px', border: '1px solid #334155' }}>
              <p style={{ margin: 0, fontSize: '13px', color: '#cbd5e1' }}>
                Documento Base: <strong style={{ color: '#38bdf8' }}>{modalAdosar.doc.nombre_archivo}</strong>
              </p>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
                Paciente: {pacienteSeleccionado?.nombre || pacienteSeleccionado?.nombre_apellido}
              </p>
            </div>

            {/* Dropzone para la nueva hoja */}
            <div
              onDragOver={(e) => { e.preventDefault(); setArrastrandoAdosar(true); }}
              onDragLeave={() => setArrastrandoAdosar(false)}
              onDrop={(e) => {
                e.preventDefault();
                setArrastrandoAdosar(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  setModalAdosar(prev => ({ ...prev, archivo: e.dataTransfer.files[0] }));
                }
              }}
              onClick={() => fileInputAdosarRef.current && fileInputAdosarRef.current.click()}
              style={{
                border: `2px dashed ${arrastrandoAdosar ? '#c084fc' : modalAdosar.archivo ? '#10b981' : '#64748b'}`,
                background: arrastrandoAdosar ? '#3b0764' : modalAdosar.archivo ? '#064e3b20' : '#0f172a',
                borderRadius: '12px',
                padding: '24px 16px',
                textAlign: 'center',
                cursor: 'pointer',
                marginBottom: '16px',
                transition: 'all 0.15s'
              }}
            >
              <input
                ref={fileInputAdosarRef}
                type="file"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setModalAdosar(prev => ({ ...prev, archivo: e.target.files[0] }));
                  }
                }}
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                style={{ display: 'none' }}
              />

              {modalAdosar.archivo ? (
                <div>
                  <span style={{ fontSize: '32px' }}>
                    {modalAdosar.archivo.name.toLowerCase().endsWith('.pdf') ? '📕' : '🖼️'}
                  </span>
                  <p style={{ margin: '6px 0 2px 0', fontSize: '14px', fontWeight: 'bold', color: '#10b981' }}>
                    {modalAdosar.archivo.name}
                  </p>
                  <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                    {(modalAdosar.archivo.size / (1024 * 1024)).toFixed(2)} MB • {modalAdosar.archivo.type || 'Archivo listo'}
                  </p>
                  <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: '#c084fc', textDecoration: 'underline' }}>
                    Clic para seleccionar otra hoja
                  </p>
                </div>
              ) : (
                <div>
                  <span style={{ fontSize: '32px' }}>📄</span>
                  <p style={{ margin: '6px 0 2px 0', fontSize: '14px', fontWeight: 'bold', color: '#cbd5e1' }}>
                    Seleccione la hoja nueva a anexar
                  </p>
                  <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                    Puede ser otro PDF (varias hojas) o una Foto / Escaneo (JPG, PNG)
                  </p>
                </div>
              )}
            </div>

            {/* Opciones de Ubicación de la Hoja */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', fontWeight: 'bold', marginBottom: '8px' }}>
                UBICACIÓN DE LA NUEVA HOJA:
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <label style={{
                  flex: 1,
                  background: modalAdosar.posicion === 'final' ? '#3b0764' : '#0f172a',
                  border: `1px solid ${modalAdosar.posicion === 'final' ? '#c084fc' : '#334155'}`,
                  borderRadius: '8px',
                  padding: '10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px'
                }}>
                  <input
                    type="radio"
                    name="posicion"
                    value="final"
                    checked={modalAdosar.posicion === 'final'}
                    onChange={() => setModalAdosar(prev => ({ ...prev, posicion: 'final' }))}
                  />
                  <span>📌 Al final (Última hoja)</span>
                </label>

                <label style={{
                  flex: 1,
                  background: modalAdosar.posicion === 'inicio' ? '#3b0764' : '#0f172a',
                  border: `1px solid ${modalAdosar.posicion === 'inicio' ? '#c084fc' : '#334155'}`,
                  borderRadius: '8px',
                  padding: '10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px'
                }}>
                  <input
                    type="radio"
                    name="posicion"
                    value="inicio"
                    checked={modalAdosar.posicion === 'inicio'}
                    onChange={() => setModalAdosar(prev => ({ ...prev, posicion: 'inicio' }))}
                  />
                  <span>📌 Al inicio (Primera hoja)</span>
                </label>
              </div>
            </div>

            {/* Opciones de Guardado: Actualizar vs Guardar como Copia Nueva */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: '#cbd5e1' }}>
                <input
                  type="checkbox"
                  checked={modalAdosar.guardarNuevo}
                  onChange={(e) => setModalAdosar(prev => ({ ...prev, guardarNuevo: e.target.checked }))}
                />
                <span>Guardar como un documento nuevo adicional (conservar el original intacto)</span>
              </label>

              {modalAdosar.guardarNuevo && (
                <div style={{ marginTop: '10px' }}>
                  <input
                    type="text"
                    value={modalAdosar.tituloNuevo}
                    onChange={(e) => setModalAdosar(prev => ({ ...prev, tituloNuevo: e.target.value }))}
                    placeholder="Título para el nuevo documento..."
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      background: '#0f172a',
                      border: '1px solid #475569',
                      color: '#fff',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                      outline: 'none'
                    }}
                  />
                </div>
              )}
            </div>

            {/* Progreso */}
            {procesandoAdosar && (
              <div style={{
                background: '#7c3aed',
                color: '#fff',
                padding: '12px 16px',
                borderRadius: '8px',
                marginBottom: '16px',
                fontSize: '13px',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span>⏳</span> {progresoAdosar || 'Procesando...'}
              </div>
            )}

            {/* Botones de acción */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setModalAdosar(null)}
                disabled={procesandoAdosar}
                style={{
                  background: '#334155',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 18px',
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
                onClick={handleConfirmarAdosar}
                disabled={procesandoAdosar || !modalAdosar.archivo}
                style={{
                  background: procesandoAdosar || !modalAdosar.archivo 
                    ? '#475569' 
                    : 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 22px',
                  borderRadius: '8px',
                  cursor: procesandoAdosar || !modalAdosar.archivo ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>🚀</span> {procesandoAdosar ? 'Uniendo...' : 'Unir y Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

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