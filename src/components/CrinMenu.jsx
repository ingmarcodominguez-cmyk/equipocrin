import React from 'react';

export default function CrinMenu({ onNavigate }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', padding: '40px', fontFamily: 'sans-serif' }}>
      <h2>Sistema CRIN</h2>
      
      {/* Fila 1: Nuevo Paciente y Editar Paciente */}
      <div style={{ display: 'flex', gap: '15px', width: '100%', maxWidth: '400px' }}>
        <button 
          style={{ flex: 1, padding: '15px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', borderRadius: '8px', border: '1px solid #ccc', backgroundColor: '#fff' }}
          onClick={() => onNavigate && onNavigate('NUEVO_PACIENTE')}
        >
          NUEVO PACIENTE
        </button>
        <button 
          style={{ flex: 1, padding: '15px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', borderRadius: '8px', border: '1px solid #ccc', backgroundColor: '#fff' }}
          onClick={() => onNavigate && onNavigate('EDITAR_PACIENTE')}
        >
          EDITAR PACIENTE
        </button>
      </div>

      {/* Fila 2: Nuevo Acuerdo */}
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <button 
          style={{ width: '100%', padding: '15px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', borderRadius: '8px', border: '1px solid #ccc', backgroundColor: '#fff' }}
          onClick={() => onNavigate && onNavigate('NUEVO_ACUERDO')}
        >
          NUEVO ACUERDO
        </button>
      </div>

      {/* Fila 3: Ficha Paciente */}
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <button 
          style={{ width: '100%', padding: '15px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', borderRadius: '8px', border: '1px solid #ccc', backgroundColor: '#fff' }}
          onClick={() => onNavigate && onNavigate('FICHA_PACIENTE')}
        >
          FICHA PACIENTE
        </button>
      </div>
    </div>
  );
}