function AgendaForm({

  ingresoSeleccionado,

  profesionalAgenda,
  setProfesionalAgenda,

  fechaAgenda,
  setFechaAgenda,

  horaAgenda,
  setHoraAgenda,

  users,

  crearAgenda
}) {

  if (!ingresoSeleccionado) return null

  return (

    <div
      style={{
        border: '2px solid black',
        padding: 20,
        marginBottom: 20
      }}
    >

      <h2>Agendar</h2>

      <p>
        Niño:
        {' '}
        {ingresoSeleccionado.nombre_nino}
      </p>

      <select
        value={profesionalAgenda}

        onChange={(e) =>
          setProfesionalAgenda(
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
            value={user.id}        >
            {user.nombre}
          </option>

        ))}

      </select>

      <br /><br />

      <input
        type="date"
        value={fechaAgenda}
        onChange={(e) =>
          setFechaAgenda(
            e.target.value
          )
        }
      />

      <br /><br />

      <input
        type="time"
        value={horaAgenda}
        onChange={(e) =>
          setHoraAgenda(
            e.target.value
          )
        }
      />

      <br /><br />

      <button
        onClick={() =>
          crearAgenda(
            ingresoSeleccionado
              .estado_pipeline
          )
        }
      >
        Crear agenda
      </button>

    </div>
  )
}

export default AgendaForm