import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'

const parsearImporte = (val) => {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  
  const str = String(val).trim()
    .replace(/\s/g, '')
    .replace(/\$/g, '');

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

const limpiarTelefono = (tel) => {
  if (!tel) return '';
  let limpio = String(tel).replace(/\D/g, '');
  if (limpio.startsWith('0')) limpio = limpio.substring(1);
  if (!limpio.startsWith('54')) {
    if (limpio.length === 10) {
      limpio = '549' + limpio;
    } else {
      limpio = '54' + limpio;
    }
  }
  return limpio;
};

export default function Presupuesto({ onVolver }) {
  const [listaPacientes, setListaPacientes] = useState([])
  const [cargandoPacientes, setCargandoPacientes] = useState(false)

  // Estados del Formulario
  const [fechaPresupuesto, setFechaPresupuesto] = useState(
    localStorage.getItem('crin_fecha_trabajo_simulada') || new Date().toISOString().split('T')[0]
  );
  const [nombrePaciente, setNombrePaciente] = useState('');
  const [dniPaciente, setDniPaciente] = useState('');
  const [modalidadPresupuesto, setModalidadPresupuesto] = useState('');
  const [horariosPresupuesto, setHorariosPresupuesto] = useState('');
  const [valorPresupuesto, setValorPresupuesto] = useState('');
  const [vencimientoPresupuesto, setVencimientoPresupuesto] = useState('Del 1 al 10 de cada mes');
  const [conceptoPago1, setConceptoPago1] = useState('Obra Social (Subsidio de Salud)');
  const [montoPago1, setMontoPago1] = useState('');
  const [conceptoPago2, setConceptoPago2] = useState('Efectivo / Transferencia / Tarjeta');
  const [montoPago2, setMontoPago2] = useState('');
  const [conceptoPago3, setConceptoPago3] = useState('');
  const [montoPago3, setMontoPago3] = useState('');
  const [conceptoPago4, setConceptoPago4] = useState('');
  const [montoPago4, setMontoPago4] = useState('');
  const [incluirFirma, setIncluirFirma] = useState(false);
  const [idPacienteSeleccionado, setIdPacienteSeleccionado] = useState(null);
  const [subiendoPdf, setSubiendoPdf] = useState(false);
  const [creadoDocId, setCreadoDocId] = useState(null);
  const [telefonoPaciente, setTelefonoPaciente] = useState('');

  // Cargar lista de pacientes por si se desea autocompletar uno existente
  useEffect(() => {
    async function cargarPacientes() {
      setCargandoPacientes(true)
      try {
        const { data, error } = await supabase
          .from('pacientes_motor')
          .select('id_paciente, nombre_apellido, dni, tel_padres, tel_alternativo')
          .order('nombre_apellido', { ascending: true })

        if (error) throw error
        if (data) setListaPacientes(data)
      } catch (err) {
        console.error("Error al cargar pacientes para presupuesto:", err)
      } finally {
        setCargandoPacientes(false)
      }
    }
    cargarPacientes()
  }, [])

  const handleSeleccionarPacienteExistente = (e) => {
    const pId = e.target.value;
    if (!pId) {
      setNombrePaciente('');
      setDniPaciente('');
      setIdPacienteSeleccionado(null);
      setTelefonoPaciente('');
      setCreadoDocId(null);
      return;
    }

    const paciente = listaPacientes.find(p => String(p.id_paciente) === String(pId));
    if (paciente) {
      setNombrePaciente(paciente.nombre_apellido || '');
      setDniPaciente(paciente.dni || '');
      setIdPacienteSeleccionado(paciente.id_paciente);
      setTelefonoPaciente(paciente.tel_padres || paciente.tel_alternativo || '');
      setCreadoDocId(null); // Resetear documento creado para obligar a guardar el nuevo
    }
  };

  const handleTotalChange = (val) => {
    setValorPresupuesto(val);
    const total = parsearImporte(val);
    const m1 = parsearImporte(montoPago1);
    if (montoPago1 === '') {
      setMontoPago2(total > 0 ? String(total) : '');
    } else {
      const rem2 = Math.max(0, total - m1);
      setMontoPago2(rem2 > 0 ? String(rem2) : '');
    }
    setMontoPago3('');
    setMontoPago4('');
  };

  const handleMonto1Change = (val) => {
    setMontoPago1(val);
    const total = parsearImporte(valorPresupuesto);
    const m1 = parsearImporte(val);
    const rem2 = Math.max(0, total - m1);
    setMontoPago2(rem2 > 0 ? String(rem2) : '');
    setMontoPago3('');
    setMontoPago4('');
  };

  const handleMonto2Change = (val) => {
    setMontoPago2(val);
    const total = parsearImporte(valorPresupuesto);
    const m1 = parsearImporte(montoPago1);
    const m2 = parsearImporte(val);
    const rem3 = Math.max(0, total - m1 - m2);
    setMontoPago3(rem3 > 0 ? String(rem3) : '');
    setMontoPago4('');
  };

  const handleMonto3Change = (val) => {
    setMontoPago3(val);
    const total = parsearImporte(valorPresupuesto);
    const m1 = parsearImporte(montoPago1);
    const m2 = parsearImporte(montoPago2);
    const m3 = parsearImporte(val);
    const rem4 = Math.max(0, total - m1 - m2 - m3);
    setMontoPago4(rem4 > 0 ? String(rem4) : '');
  };

  const handleGuardarPdf = async () => {
    if (!idPacienteSeleccionado) {
      alert("Para guardar en la nube de Supabase y poder enviar por WhatsApp (con los botones de Aceptar/Rechazar), tenés que seleccionar un paciente registrado de la lista.\n\nSi es un paciente nuevo, registralo primero en la pestaña de Pacientes.");
      return;
    }
    if (!nombrePaciente.trim()) {
      alert("Por favor, ingresá el nombre del paciente antes de guardar.");
      return;
    }
    
    setSubiendoPdf(true);
    setCreadoDocId(null);
    try {
      const element = document.getElementById("printable-presupuesto-area");
      if (!element) throw new Error("No se encontró la vista previa del presupuesto.");

      // Generar canvas
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff"
      });

      const imgData = canvas.toDataURL("image/png");

      // Dimensiones de A4
      const pdf = new jsPDF("p", "mm", "a4");
      const imgWidth = 210; 
      const pageHeight = 295; 
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const pdfBlob = pdf.output("blob");

      // Nombres de archivos y rutas
      const cleanName = nombrePaciente.replace(/\s+/g, '_').toLowerCase();
      const dateStr = new Date().toISOString().split('T')[0];
      const randomId = Math.floor(1000 + Math.random() * 9000);
      const uniqueFileName = `presupuesto_${cleanName}_${dateStr}_${randomId}.pdf`;

      // Definir la ruta en storage
      const folder = String(idPacienteSeleccionado);
      const pathInStorage = `${folder}/${uniqueFileName}`;

      // Subir archivo al bucket 'documentos_pacientes'
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documentos_pacientes')
        .upload(pathInStorage, pdfBlob, {
          contentType: 'application/pdf',
          upsert: true
        });

      if (uploadError) {
        throw new Error(`Error al subir a Supabase Storage: ${uploadError.message}`);
      }

      // Obtener la URL pública del PDF
      const { data: publicUrlData } = supabase.storage
        .from('documentos_pacientes')
        .getPublicUrl(pathInStorage);

      const publicUrl = publicUrlData?.publicUrl;

      // Registrar en la tabla de base de datos 'documentos_pacientes'
      const { data: dbData, error: dbError } = await supabase
        .from('documentos_pacientes')
        .insert({
          id_paciente_excel: idPacienteSeleccionado,
          nombre_archivo: `[PENDIENTE] Presupuesto - ${nombrePaciente}`,
          url_storage: pathInStorage,
          fecha_subida: new Date().toISOString()
        })
        .select();

      if (dbError) {
        throw dbError;
      }

      if (dbData && dbData.length > 0) {
        setCreadoDocId(dbData[0].id);
      }

      alert(`¡Presupuesto guardado y vinculado con éxito en Supabase!\n\nA partir de ahora figurará en la sección "Documentos" del paciente.\n\nLink al PDF:\n${publicUrl}\n\nYa podés enviarlo por WhatsApp presionando el botón correspondiente.`);
    } catch (err) {
      console.error("Error al guardar PDF:", err);
      alert(`Error al generar o guardar el PDF: ${err.message}`);
    } finally {
      setSubiendoPdf(false);
    }
  };

  const handleEnviarWhatsApp = () => {
    if (!creadoDocId) {
      alert("Por favor, guardá primero el presupuesto en Supabase antes de enviarlo.");
      return;
    }
    const publicLink = `${window.location.origin}/?presupuesto=${creadoDocId}`;
    const textoMsg = `¡Hola! Le compartimos el presupuesto del tratamiento para ${nombrePaciente}. Puede revisarlo, descargarlo y confirmarlo (Aceptar o Rechazar) ingresando en este link:\n\n${publicLink}`;
    
    const telLimpio = limpiarTelefono(telefonoPaciente);
    if (telLimpio) {
      const url = `https://wa.me/${telLimpio}?text=${encodeURIComponent(textoMsg)}`;
      window.open(url, '_blank');
    } else {
      const url = `https://wa.me/?text=${encodeURIComponent(textoMsg)}`;
      window.open(url, '_blank');
    }
  };

  return (
    <div style={{ padding: '0', backgroundColor: '#ffffff', color: '#1e293b', fontSize: '14px', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* Estilo para impresión */}
      <style>{`
        @media print {
          /* Ocultamos todo en la página */
          body * {
            visibility: hidden !important;
          }
          /* Hacemos visible el área de presupuesto y sus hijos */
          #printable-presupuesto-area, #printable-presupuesto-area * {
            visibility: visible !important;
          }
          /* Forzamos que ocupe toda la pantalla de impresión */
          #printable-presupuesto-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: #ffffff !important;
            color: #000000 !important;
            padding: 40px !important;
            box-shadow: none !important;
            border: none !important;
          }
          /* Ocultar botones de navegación y configuración durante impresión */
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Cabecera no imprimible */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #cbd5e1', paddingBottom: '15px', marginBottom: '25px' }}>
        <div>
          <h2 style={{ color: '#1e293b', margin: 0, fontSize: '22px', fontWeight: 'bold' }}>📄 Generador de Presupuesto</h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>Escribí los datos para un nuevo paciente potencial o seleccioná uno existente.</p>
        </div>
        <button
          onClick={onVolver}
          style={{ background: '#64748b', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: '500', transition: 'background 0.2s' }}
          onMouseOver={(e) => e.target.style.background = '#475569'}
          onMouseOut={(e) => e.target.style.background = '#64748b'}
        >
          ← Volver al Menú Principal
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '30px', alignItems: 'start', marginBottom: '40px' }}>
        
        {/* Formulario de Configuración (Izquierda) */}
        <div className="no-print" style={{ background: '#f8fafc', padding: '25px', borderRadius: '14px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', color: '#1e293b', fontWeight: 'bold', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>⚙️ Datos del Presupuesto</h3>
          
          {/* Autocompletar desde paciente existente */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: '#eff6ff', padding: '12px', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#1e40af' }}>¿Auto-completar con Paciente Existente?</label>
            <select 
              onChange={handleSeleccionarPacienteExistente}
              defaultValue=""
              style={{ padding: '8px', borderRadius: '6px', border: '1px solid #93c5fd', fontSize: '13px', background: '#fff', outline: 'none' }}
            >
              <option value="">-- Seleccionar Paciente Registrado (Opcional) --</option>
              {listaPacientes.map(p => (
                <option key={p.id_paciente} value={p.id_paciente}>{p.nombre_apellido} {p.dni ? `(DNI: ${p.dni})` : ''}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>Nombre del Paciente:</label>
            <input 
              type="text" 
              placeholder="Ej: Juan Pérez" 
              value={nombrePaciente} 
              onChange={(e) => setNombrePaciente(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>DNI del Paciente (Opcional):</label>
            <input 
              type="text" 
              placeholder="Ej: 12.345.678" 
              value={dniPaciente} 
              onChange={(e) => setDniPaciente(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>Fecha de Emisión:</label>
            <input 
              type="date" 
              value={fechaPresupuesto} 
              onChange={(e) => setFechaPresupuesto(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>Modalidad del Tratamiento:</label>
            <input 
              type="text" 
              placeholder="Ej: Taller de Estimulación / Módulo Integral" 
              value={modalidadPresupuesto} 
              onChange={(e) => setModalidadPresupuesto(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
            />
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
              {['Taller', 'Módulo Integral', 'Módulo de Tratamiento', 'Tratamiento Neurocognitivo'].map(m => (
                <button
                  key={m}
                  onClick={() => setModalidadPresupuesto(m)}
                  style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '12px', background: '#dbeafe', border: 'none', color: '#1e40af', cursor: 'pointer' }}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>Horarios / Frecuencia:</label>
            <input 
              type="text" 
              placeholder="Ej: Lunes y Miércoles 16:00 hs / 2 sesiones semanales" 
              value={horariosPresupuesto} 
              onChange={(e) => setHorariosPresupuesto(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>Valor de la Cuota:</label>
            <div style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', paddingLeft: '12px', overflow: 'hidden' }}>
              <span style={{ color: '#64748b', fontWeight: 'bold', fontSize: '14px' }}>$</span>
              <input 
                type="text" 
                placeholder="Ej: 330000" 
                value={valorPresupuesto} 
                onChange={(e) => handleTotalChange(e.target.value)}
                style={{ border: 'none', outline: 'none', padding: '8px 12px 8px 6px', fontSize: '14px', width: '100%', background: 'transparent' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>Fecha de Vencimiento de Cuotas:</label>
            <input 
              type="text" 
              value={vencimientoPresupuesto} 
              onChange={(e) => setVencimientoPresupuesto(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>Detalle de Formas de Pago (Concepto y Monto):</label>
            
            {/* Fila 1 */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input 
                type="text" 
                placeholder="Concepto 1 (ej: Subsidio de Salud)" 
                value={conceptoPago1} 
                onChange={(e) => setConceptoPago1(e.target.value)}
                style={{ flex: 2, padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
              />
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', paddingLeft: '10px', overflow: 'hidden' }}>
                <span style={{ color: '#64748b', fontWeight: 'bold', fontSize: '13px' }}>$</span>
                <input 
                  type="text" 
                  placeholder="Monto" 
                  value={montoPago1} 
                  onChange={(e) => handleMonto1Change(e.target.value)}
                  style={{ border: 'none', outline: 'none', padding: '8px 10px 8px 4px', fontSize: '13px', width: '100%', background: 'transparent' }}
                />
              </div>
            </div>

            {/* Fila 2 */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input 
                type="text" 
                placeholder="Concepto 2 (ej: Efectivo)" 
                value={conceptoPago2} 
                onChange={(e) => setConceptoPago2(e.target.value)}
                style={{ flex: 2, padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
              />
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', paddingLeft: '10px', overflow: 'hidden' }}>
                <span style={{ color: '#64748b', fontWeight: 'bold', fontSize: '13px' }}>$</span>
                <input 
                  type="text" 
                  placeholder="Monto" 
                  value={montoPago2} 
                  onChange={(e) => handleMonto2Change(e.target.value)}
                  style={{ border: 'none', outline: 'none', padding: '8px 10px 8px 4px', fontSize: '13px', width: '100%', background: 'transparent' }}
                />
              </div>
            </div>

            {/* Fila 3 */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input 
                type="text" 
                placeholder="Concepto 3 (ej: Transferencia)" 
                value={conceptoPago3} 
                onChange={(e) => setConceptoPago3(e.target.value)}
                style={{ flex: 2, padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
              />
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', paddingLeft: '10px', overflow: 'hidden' }}>
                <span style={{ color: '#64748b', fontWeight: 'bold', fontSize: '13px' }}>$</span>
                <input 
                  type="text" 
                  placeholder="Monto" 
                  value={montoPago3} 
                  onChange={(e) => handleMonto3Change(e.target.value)}
                  style={{ border: 'none', outline: 'none', padding: '8px 10px 8px 4px', fontSize: '13px', width: '100%', background: 'transparent' }}
                />
              </div>
            </div>

            {/* Fila 4 */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input 
                type="text" 
                placeholder="Concepto 4 (ej: Tarjeta de Crédito)" 
                value={conceptoPago4} 
                onChange={(e) => setConceptoPago4(e.target.value)}
                style={{ flex: 2, padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
              />
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', paddingLeft: '10px', overflow: 'hidden' }}>
                <span style={{ color: '#64748b', fontWeight: 'bold', fontSize: '13px' }}>$</span>
                <input 
                  type="text" 
                  placeholder="Monto" 
                  value={montoPago4} 
                  onChange={(e) => setMontoPago4(e.target.value)}
                  style={{ border: 'none', outline: 'none', padding: '8px 10px 8px 4px', fontSize: '13px', width: '100%', background: 'transparent' }}
                />
              </div>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', background: '#f5f3ff', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', marginTop: '10px' }}>
            <input 
              type="checkbox" 
              checked={incluirFirma} 
              onChange={(e) => setIncluirFirma(e.target.checked)}
            />
            <strong>🖋️ Incluir Firma Digital de la Coordinación</strong>
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
            <button
              onClick={() => window.print()}
              style={{ background: '#7c3aed', color: '#fff', border: 'none', padding: '12px 20px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '15px', boxShadow: '0 4px 6px rgba(124, 58, 237, 0.25)', transition: 'background 0.2s' }}
              onMouseOver={(e) => e.target.style.background = '#6d28d9'}
              onMouseOut={(e) => e.target.style.background = '#7c3aed'}
            >
              📥 Imprimir / Guardar como PDF local
            </button>

            <button
              onClick={handleGuardarPdf}
              disabled={subiendoPdf}
              style={{ 
                background: subiendoPdf ? '#94a3b8' : '#10b981', 
                color: '#fff', 
                border: 'none', 
                padding: '12px 20px', 
                borderRadius: '10px', 
                fontWeight: 'bold', 
                cursor: subiendoPdf ? 'not-allowed' : 'pointer', 
                fontSize: '15px', 
                boxShadow: '0 4px 6px rgba(16, 185, 129, 0.25)', 
                transition: 'background 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
              onMouseOver={(e) => { if (!subiendoPdf) e.target.style.background = '#059669' }}
              onMouseOut={(e) => { if (!subiendoPdf) e.target.style.background = '#10b981' }}
            >
              {subiendoPdf ? '⏳ Generando y Subiendo a Supabase...' : '💾 Guardar en Supabase (Nube)'}
            </button>

            {creadoDocId && (
              <button
                onClick={handleEnviarWhatsApp}
                style={{ 
                  background: '#25d366', 
                  color: '#fff', 
                  border: 'none', 
                  padding: '12px 20px', 
                  borderRadius: '10px', 
                  fontWeight: 'bold', 
                  cursor: 'pointer', 
                  fontSize: '15px', 
                  boxShadow: '0 4px 6px rgba(37, 211, 102, 0.25)', 
                  transition: 'background 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
                onMouseOver={(e) => e.target.style.background = '#128c7e'}
                onMouseOut={(e) => e.target.style.background = '#25d366'}
              >
                💬 Enviar enlace por WhatsApp
              </button>
            )}
          </div>
        </div>

        {/* Vista Previa del Presupuesto (Derecha) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <span className="no-print" style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b' }}>👁️ Vista Previa en Pantalla:</span>
          
          {/* Contenedor Imprimible */}
          <div 
            id="printable-presupuesto-area" 
            style={{ 
              background: '#ffffff', 
              border: '1px solid #cbd5e1', 
              borderRadius: '12px', 
              padding: '40px', 
              boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
              minHeight: '680px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              color: '#1e293b',
              fontFamily: 'Segoe UI, Helvetica, sans-serif'
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
                    Fecha: <strong>{fechaPresupuesto ? new Date(fechaPresupuesto + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}</strong>
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
                  <strong style={{ color: '#0f172a', fontSize: '15px' }}>{nombrePaciente ? nombrePaciente.toUpperCase() : 'Sin completar'}</strong>
                </div>

                <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                  <span style={{ color: '#64748b', fontWeight: '600', display: 'inline-block', width: '120px' }}>DNI:</span>
                  <strong style={{ color: '#0f172a' }}>{dniPaciente || 'S/D'}</strong>
                </div>

                <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                  <span style={{ color: '#64748b', fontWeight: '600', display: 'inline-block', width: '120px' }}>Modalidad:</span>
                  <strong style={{ color: '#0f172a' }}>{modalidadPresupuesto || 'Sin completar'}</strong>
                </div>

                <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                  <span style={{ color: '#64748b', fontWeight: '600', display: 'inline-block', width: '120px' }}>Horarios:</span>
                  <strong style={{ color: '#0f172a' }}>{horariosPresupuesto || 'Sin completar'}</strong>
                </div>

                <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                  <span style={{ color: '#64748b', fontWeight: '600', display: 'inline-block', width: '120px' }}>Valor de Cuota:</span>
                  <strong style={{ color: '#1e3a8a', fontSize: '16px' }}>
                    {valorPresupuesto && parsearImporte(valorPresupuesto) > 0 ? `$${parsearImporte(valorPresupuesto).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : (valorPresupuesto || 'Sin completar')}
                  </strong>
                </div>

                <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                  <span style={{ color: '#64748b', fontWeight: '600', display: 'inline-block', width: '120px' }}>Vencimiento:</span>
                  <strong style={{ color: '#0f172a' }}>{vencimientoPresupuesto || 'Sin completar'}</strong>
                </div>

                {/* Forma de Pago (Casilleros) */}
                <div style={{ marginTop: '10px' }}>
                  <span style={{ color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '10px' }}>Detalle de las Formas de Pago:</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {conceptoPago1 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ display: 'inline-block', width: '16px', height: '16px', border: '1px solid #475569', background: '#f1f5f9', textAlign: 'center', lineHeight: '14px', fontSize: '11px', fontWeight: 'bold' }}>X</span>
                        <span>{conceptoPago1}</span>
                        {montoPago1 && (
                          <strong style={{ marginLeft: 'auto' }}>
                            {parsearImporte(montoPago1) > 0 ? `$${parsearImporte(montoPago1).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : montoPago1}
                          </strong>
                        )}
                      </div>
                    )}
                    {conceptoPago2 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ display: 'inline-block', width: '16px', height: '16px', border: '1px solid #475569', background: '#f1f5f9', textAlign: 'center', lineHeight: '14px', fontSize: '11px', fontWeight: 'bold' }}>X</span>
                        <span>{conceptoPago2}</span>
                        {montoPago2 && (
                          <strong style={{ marginLeft: 'auto' }}>
                            {parsearImporte(montoPago2) > 0 ? `$${parsearImporte(montoPago2).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : montoPago2}
                          </strong>
                        )}
                      </div>
                    )}
                    {conceptoPago3 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ display: 'inline-block', width: '16px', height: '16px', border: '1px solid #475569', background: '#f1f5f9', textAlign: 'center', lineHeight: '14px', fontSize: '11px', fontWeight: 'bold' }}>X</span>
                        <span>{conceptoPago3}</span>
                        {montoPago3 && (
                          <strong style={{ marginLeft: 'auto' }}>
                            {parsearImporte(montoPago3) > 0 ? `$${parsearImporte(montoPago3).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : montoPago3}
                          </strong>
                        )}
                      </div>
                    )}
                    {conceptoPago4 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ display: 'inline-block', width: '16px', height: '16px', border: '1px solid #475569', background: '#f1f5f9', textAlign: 'center', lineHeight: '14px', fontSize: '11px', fontWeight: 'bold' }}>X</span>
                        <span>{conceptoPago4}</span>
                        {montoPago4 && (
                          <strong style={{ marginLeft: 'auto' }}>
                            {parsearImporte(montoPago4) > 0 ? `$${parsearImporte(montoPago4).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : montoPago4}
                          </strong>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Firmas y Datos de Pie */}
            <div style={{ marginTop: '55px' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '40px', padding: '0 20px' }}>
                <div style={{ width: '200px', borderTop: '1px solid #cbd5e1', textAlign: 'center', paddingTop: '8px', fontSize: '12px', color: '#64748b', position: 'relative' }}>
                  {incluirFirma && (
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
        </div>
      </div>
    </div>
  )
}
