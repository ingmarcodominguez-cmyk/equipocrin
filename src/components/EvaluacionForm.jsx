import { useState } from 'react'

function EvaluacionForm({

  ingresoSeleccionado,

  users,

  guardarEvaluaciones

}) {

  const [
    evaluaciones,
    setEvaluaciones
  ] = useState([

    {
      profesional: '',
      fecha: '',
      hora: ''
    }
  ])

  if (!ingresoSeleccionado)
    return null

  function agregarFila() {

    setEvaluaciones([

      ...evaluaciones,

      {
        profesional: '',
        fecha: '',
        hora: ''
      }
    ])
  }

  function actualizarFila(
    index,
    campo,
    valor
  ) {

    const nuevas =
      [...evaluaciones]

    nuevas[index][campo] =
      valor

    setEvaluaciones(nuevas)
  }

  return (

    <div
      style={{
        border: '2px solid blue',
        padding: 20,
        marginBottom: 20
      }}
    >

      <h2>
        Evaluaciones
      </h2>

      <p>
        Niño:
        {' '}
        {
          ingresoSeleccionado
            .nombre_nino
        }
      </p>

      {evaluaciones.map(
        (ev, index) => (

          <div
  key={index}

  style={{
    marginBottom: 20,
    border: '1px solid gray',
    padding: 10
  }}
>
            <select

              value={ev.profesional}

              onChange={(e) =>
                actualizarFila(
                  index,
                  'profesional',
                  e.target.value
                )
              }
            >

              <option value="">
                Profesional
              </option>

              {users.map((user) => (

                <option
                  key={user.id}
                  value={user.id}
                >
                  {user.nombre}
                </option>

              ))}

            </select>

            <br /><br />

            <input
              type="date"

              value={ev.fecha}

              onChange={(e) =>
                actualizarFila(
                  index,
                  'fecha',
                  e.target.value
                )
              }
            />

            <br /><br />

            <input
              type="time"

              value={ev.hora}

              onChange={(e) =>
                actualizarFila(
                  index,
                  'hora',
                  e.target.value
                )
              }
            />

          </div>
        )
      )}

      <button onClick={agregarFila}>
        + Agregar profesional
      </button>

      <br /><br />

      <button
        onClick={() =>
          guardarEvaluaciones(
            evaluaciones
          )
        }
      >
        Guardar evaluaciones
      </button>

    </div>
  )
}

export default EvaluacionForm