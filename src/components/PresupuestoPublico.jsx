import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function PresupuestoPublico({ id }) {
  const [documento, setDocumento] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('PENDIENTE'); // PENDIENTE, ACEPTADO, RECHAZADO
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [mostrarRechazoForm, setMostrarRechazoForm] = useState(false);
  const [procesandoAccion, setProcesandoAccion] = useState(false);

  useEffect(() => {
    async function fetchDocumento() {
      setCargando(true);
      try {
        const { data, error: dbError } = await supabase
          .from('documentos_pacientes')
          .select('*')
          .eq('id', id)
          .single();

        if (dbError) throw dbError;
        if (!data) throw new Error('No se encontró el presupuesto especificado.');

        setDocumento(data);

        // Detectar estado a partir del nombre del archivo
        const nombre = data.nombre_archivo || '';
        if (nombre.startsWith('[ACEPTADO]')) {
          setStatus('ACEPTADO');
        } else if (nombre.startsWith('[RECHAZADO]')) {
          setStatus('RECHAZADO');
        } else {
          setStatus('PENDIENTE');
        }
      } catch (err) {
        console.error('Error al cargar presupuesto público:', err);
        setError(err.message || 'Error desconocido.');
      } finally {
        setCargando(false);
      }
    }
    if (id) fetchDocumento();
  }, [id]);

  const handleAceptar = async () => {
    setProcesandoAccion(true);
    try {
      let nuevoNombre = documento.nombre_archivo || '';
      nuevoNombre = nuevoNombre.replace('[PENDIENTE] ', '').replace('[RECHAZADO] ', '').replace('[ACEPTADO] ', '');
      nuevoNombre = `[ACEPTADO] ${nuevoNombre}`;

      const { error: updateError } = await supabase
        .from('documentos_pacientes')
        .update({ nombre_archivo: nuevoNombre })
        .eq('id', id);

      if (updateError) throw updateError;

      setStatus('ACEPTADO');
      setDocumento(prev => ({ ...prev, nombre_archivo: nuevoNombre }));
    } catch (err) {
      console.error('Error al aceptar presupuesto:', err);
      alert('Ocurrió un error al procesar la aceptación: ' + err.message);
    } finally {
      setProcesandoAccion(false);
    }
  };

  const handleRechazar = async () => {
    setProcesandoAccion(true);
    try {
      let nuevoNombre = documento.nombre_archivo || '';
      nuevoNombre = nuevoNombre.replace('[PENDIENTE] ', '').replace('[RECHAZADO] ', '').replace('[ACEPTADO] ', '');
      
      const detalleMotivo = motivoRechazo.trim() ? ` (Motivo: ${motivoRechazo.trim()})` : '';
      nuevoNombre = `[RECHAZADO] ${nuevoNombre}${detalleMotivo}`;

      const { error: updateError } = await supabase
        .from('documentos_pacientes')
        .update({ nombre_archivo: nuevoNombre })
        .eq('id', id);

      if (updateError) throw updateError;

      setStatus('RECHAZADO');
      setDocumento(prev => ({ ...prev, nombre_archivo: nuevoNombre }));
      setMostrarRechazoForm(false);
      alert('El presupuesto ha sido marcado como rechazado. Nos pondremos en contacto para revisar las alternativas.');
    } catch (err) {
      console.error('Error al rechazar presupuesto:', err);
      alert('Ocurrió un error al procesar el rechazo: ' + err.message);
    } finally {
      setProcesandoAccion(false);
    }
  };

  const parsearImporteLocal = (val) => {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return val;
    const str = String(val).trim().replace(/\s/g, '').replace(/\$/g, '');
    if (str.includes(',')) {
      const limpio = str.replace(/\./g, '').replace(',', '.');
      const num = parseFloat(limpio);
      return isNaN(num) ? 0 : num;
    }
    if (str.includes('.')) {
      const partes = str.split('.');
      if (partes.length > 2 || partes[1].length === 3) {
        const limpio = str.replace(/\./g, '');
        const num = parseFloat(limpio);
        return isNaN(num) ? 0 : num;
      }
    }
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  };

  if (cargando) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, sans-serif', padding: '20px' }}>
        <div style={{ border: '4px solid #e2e8f0', borderTop: '4px solid #3b82f6', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite' }} />
        <span style={{ marginTop: '15px', color: '#64748b', fontSize: '15px', fontWeight: '500' }}>Cargando presupuesto...</span>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (error || !documento) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, sans-serif', padding: '20px', textAlign: 'center' }}>
        <div style={{ background: '#fee2e2', color: '#ef4444', padding: '16px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '15px' }}>
          <span style={{ fontSize: '24px' }}>⚠️</span>
        </div>
        <h3 style={{ color: '#0f172a', margin: '0 0 8px 0', fontSize: '18px' }}>No se pudo cargar el presupuesto</h3>
        <p style={{ color: '#64748b', maxWidth: '400px', margin: '0 0 20px 0', fontSize: '14px' }}>{error || 'El link es inválido o el presupuesto ya no está disponible.'}</p>
      </div>
    );
  }

  // Detectar si el almacenamiento es JSON o un PDF tradicional
  let datosJSON = null;
  const isJSON = documento.url_storage && documento.url_storage.startsWith('JSON:');
  if (isJSON) {
    try {
      datosJSON = JSON.parse(documento.url_storage.substring(5));
    } catch (e) {
      console.error('Error parsing budget JSON:', e);
    }
  }

  // URL para descargar PDF tradicional (caso de retrocompatibilidad)
  const publicUrlPDF = !isJSON ? `https://gqhfrzvtccxrixdtazzs.supabase.co/storage/v1/object/public/documentos_pacientes/${documento.url_storage}` : '';

  // Formatear nombre del paciente para mostrar
  const nombreLimpio = documento.nombre_archivo
    .replace('[PENDIENTE] ', '')
    .replace('[ACEPTADO] ', '')
    .replace('[RECHAZADO] ', '')
    .replace('Presupuesto - ', '');

  return (
    <div className="budget-public-container" style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '20px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      
      {/* Estilos CSS para impresión nativa */}
      <style>{`
        @media print {
          body {
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .no-print {
            display: none !important;
          }
          .budget-public-container {
            background: #ffffff !important;
            padding: 0 !important;
          }
          .printable-card-area {
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
          }
        }
      `}</style>

      {/* Contenedor principal */}
      <div className="printable-card-area" style={{ width: '100%', maxWidth: '750px', background: '#ffffff', borderRadius: '16px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05), 0 8px 10px -6px rgba(0,0,0,0.05)', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Encabezado del Centro (Oculto al imprimir si es JSON para usar el encabezado de la hoja) */}
        <div className={isJSON ? 'no-print' : ''} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', borderBottom: '2px solid #3b82f6', paddingBottom: '16px', textAlign: 'center' }}>
          <h1 style={{ margin: 0, fontSize: '24px', color: '#1e3a8a', fontWeight: '900', letterSpacing: '1px' }}>EQUIPO CRIN</h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>Centro de Rehabilitación e Integración Neurocognitiva</p>
        </div>

        {/* Info y Estado del Presupuesto */}
        <div className="no-print" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '14px', color: '#475569' }}>
            Presupuesto de Tratamiento para: <strong style={{ color: '#0f172a', fontSize: '16px' }}>{nombreLimpio.toUpperCase()}</strong>
          </div>
          
          {status === 'PENDIENTE' && (
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', padding: '12px', borderRadius: '8px', fontSize: '13px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <span>ℹ️</span> Por favor, revise el presupuesto de tratamiento detallado abajo y confirme su aceptación o rechazo.
            </div>
          )}

          {status === 'ACEPTADO' && (
            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', padding: '12px', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <span>✅</span> Presupuesto Aceptado. ¡Muchas gracias por su conformidad! Se ha registrado su aceptación.
            </div>
          )}

          {status === 'RECHAZADO' && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', padding: '12px', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <span>❌</span> Presupuesto Rechazado. Nos comunicaremos a la brevedad para evaluar otras opciones.
            </div>
          )}
        </div>

        {/* Visor de Presupuesto */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          
          {/* CASO A: Documento Nivel JSON (Renderizado Nativo HTML seguro y móvil compatible) */}
          {isJSON && datosJSON ? (
            <div 
              style={{ 
                background: '#ffffff', 
                border: '1px solid #cbd5e1', 
                borderRadius: '12px', 
                padding: '30px 20px', 
                color: '#1e293b',
                fontFamily: 'Segoe UI, Helvetica, sans-serif',
                minHeight: '600px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
            >
              <div>
                {/* Encabezado */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #3b82f6', paddingBottom: '15px', marginBottom: '25px' }}>
                  <div>
                    <h1 style={{ margin: 0, fontSize: '26px', color: '#1e3a8a', fontWeight: '900', letterSpacing: '1px' }}>EQUIPO CRIN</h1>
                    <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>Centro de Rehabilitación e Integración Neurocognitiva</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: 0, fontSize: '13px', color: '#475569', fontWeight: '500' }}>
                      Fecha: <strong>{datosJSON.fecha ? new Date(datosJSON.fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}</strong>
                    </p>
                  </div>
                </div>

                {/* Título de la Hoja */}
                <div style={{ textAlign: 'center', marginBottom: '35px' }}>
                  <h2 style={{ margin: 0, fontSize: '20px', color: '#1e3a8a', fontWeight: 'bold', textDecoration: 'underline' }}>PRESUPUESTO DE TRATAMIENTO</h2>
                </div>

                {/* Cuerpo de la Información */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', fontSize: '14px', lineHeight: '1.6' }}>
                  <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                    <span style={{ color: '#64748b', fontWeight: '600', display: 'inline-block', width: '120px' }}>Paciente:</span>
                    <strong style={{ color: '#0f172a', fontSize: '15px' }}>{datosJSON.paciente ? datosJSON.paciente.toUpperCase() : 'Sin completar'}</strong>
                  </div>

                  <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                    <span style={{ color: '#64748b', fontWeight: '600', display: 'inline-block', width: '120px' }}>DNI:</span>
                    <strong style={{ color: '#0f172a' }}>{datosJSON.dni || 'S/D'}</strong>
                  </div>

                  <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                    <span style={{ color: '#64748b', fontWeight: '600', display: 'inline-block', width: '120px' }}>Modalidad:</span>
                    <strong style={{ color: '#0f172a' }}>{datosJSON.modalidad || 'Sin completar'}</strong>
                  </div>

                  <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                    <span style={{ color: '#64748b', fontWeight: '600', display: 'inline-block', width: '120px' }}>Horarios:</span>
                    <strong style={{ color: '#0f172a' }}>{datosJSON.horarios || 'Sin completar'}</strong>
                  </div>

                  <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                    <span style={{ color: '#64748b', fontWeight: '600', display: 'inline-block', width: '120px' }}>Valor de Cuota:</span>
                    <strong style={{ color: '#1e3a8a', fontSize: '16px' }}>
                      {datosJSON.total && parsearImporteLocal(datosJSON.total) > 0 ? `$${parsearImporteLocal(datosJSON.total).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : (datosJSON.total || 'Sin completar')}
                    </strong>
                  </div>

                  <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                    <span style={{ color: '#64748b', fontWeight: '600', display: 'inline-block', width: '120px' }}>Vencimiento:</span>
                    <strong style={{ color: '#0f172a' }}>{datosJSON.vencimiento || 'Sin completar'}</strong>
                  </div>

                  {/* Forma de Pago (Casilleros) */}
                  <div style={{ marginTop: '10px' }}>
                    <span style={{ color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '10px' }}>Detalle de las Formas de Pago:</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {datosJSON.pagos && datosJSON.pagos.map((p, idx) => p.c && (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ display: 'inline-block', width: '16px', height: '16px', border: '1px solid #475569', background: '#f1f5f9', textAlign: 'center', lineHeight: '14px', fontSize: '11px', fontWeight: 'bold' }}>X</span>
                          <span>{p.c}</span>
                          {p.m && (
                            <strong style={{ marginLeft: 'auto' }}>
                              {parsearImporteLocal(p.m) > 0 ? `$${parsearImporteLocal(p.m).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : p.m}
                            </strong>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Firmas y Datos de Pie */}
              <div style={{ marginTop: '55px' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '40px', padding: '0 20px' }}>
                  <div style={{ width: '200px', borderTop: '1px solid #cbd5e1', textAlign: 'center', paddingTop: '8px', fontSize: '12px', color: '#64748b', position: 'relative' }}>
                    {datosJSON.incluirFirma && (
                      <img 
                        src="/firma_coordinacion.png" 
                        alt="Firma" 
                        style={{ 
                          position: 'absolute', 
                          bottom: '22px', 
                          left: '50%', 
                          transform: 'translateX(-50%)', 
                          height: '55px', 
                          objectFit: 'contain',
                          mixBlendMode: 'multiply',
                          pointerEvents: 'none'
                        }}
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    )}
                    Firma Coordinación
                  </div>
                </div>
                <div style={{ textAlign: 'center', marginTop: '40px', borderTop: '1px solid #e2e8f0', paddingTop: '12px', fontSize: '11px', color: '#94a3b8' }}>
                  EQUIPO CRIN - Centro de Estimulación y Neurorehabilitación Cognitiva
                </div>
              </div>
            </div>
          ) : (
            
            /* CASO B: PDF tradicional (Google Docs IFrame) */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="no-print">
                <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#475569' }}>📄 Documento de Presupuesto:</span>
                <a 
                  href={publicUrlPDF} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  style={{ fontSize: '13px', color: '#2563eb', fontWeight: '600', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  📥 Descargar PDF original
                </a>
              </div>

              <div style={{ position: 'relative', width: '100%', height: '520px', borderRadius: '12px', border: '1px solid #cbd5e1', overflow: 'hidden', background: '#cbd5e1' }}>
                <iframe 
                  src={`https://docs.google.com/viewer?url=${encodeURIComponent(publicUrlPDF)}&embedded=true`}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  title="Presupuesto"
                />
              </div>
            </div>
          )}
        </div>

        {/* Acciones */}
        {status === 'PENDIENTE' && !mostrarRechazoForm && (
          <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }} className="no-print">
            <button
              onClick={handleAceptar}
              disabled={procesandoAccion}
              style={{ 
                flex: 1, 
                background: '#10b981', 
                color: '#fff', 
                border: 'none', 
                padding: '14px 20px', 
                borderRadius: '12px', 
                fontWeight: 'bold', 
                cursor: procesandoAccion ? 'not-allowed' : 'pointer', 
                fontSize: '16px', 
                boxShadow: '0 4px 6px rgba(16, 185, 129, 0.2)',
                transition: 'background 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              {procesandoAccion ? 'Procesando...' : '✅ Aceptar Presupuesto'}
            </button>

            <button
              onClick={() => setMostrarRechazoForm(true)}
              disabled={procesandoAccion}
              style={{ 
                flex: 1, 
                background: '#ef4444', 
                color: '#fff', 
                border: 'none', 
                padding: '14px 20px', 
                borderRadius: '12px', 
                fontWeight: 'bold', 
                cursor: procesandoAccion ? 'not-allowed' : 'pointer', 
                fontSize: '16px', 
                boxShadow: '0 4px 6px rgba(239, 68, 68, 0.2)',
                transition: 'background 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              ❌ Rechazar Presupuesto
            </button>
          </div>
        )}

        {/* Formulario de Rechazo */}
        {mostrarRechazoForm && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: '#fff5f5', border: '1px solid #fee2e2', borderRadius: '12px', padding: '16px', marginTop: '10px' }} className="no-print">
            <h4 style={{ margin: 0, color: '#991b1b', fontSize: '15px' }}>Rechazar Presupuesto</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#7f1d1d' }}>Por favor, indíquenos brevemente el motivo (opcional):</label>
              <textarea
                placeholder="Ej: Deseo coordinar otra forma de pago / Los horarios no me coinciden..."
                value={motivoRechazo}
                onChange={(e) => setMotivoRechazo(e.target.value)}
                style={{ padding: '10px', borderRadius: '8px', border: '1px solid #fca5a5', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', minHeight: '80px', outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setMostrarRechazoForm(false)}
                style={{ background: 'transparent', border: 'none', color: '#475569', fontSize: '13px', fontWeight: 'bold', padding: '8px 12px', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleRechazar}
                disabled={procesandoAccion}
                style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Confirmar Rechazo
              </button>
            </div>
          </div>
        )}

        {/* Botón de impresión para el Padre (Caso JSON) */}
        {isJSON && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }} className="no-print">
            <button
              onClick={() => window.print()}
              style={{ background: '#475569', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              🖨️ Imprimir / Guardar copia local
            </button>
          </div>
        )}
      </div>

      {/* Pie de Página */}
      <span style={{ fontSize: '11px', color: '#64748b', marginTop: '20px', textAlign: 'center' }} className="no-print">
        EQUIPO CRIN - Centro de Estimulación y Neurorehabilitación Cognitiva
      </span>
    </div>
  );
}
