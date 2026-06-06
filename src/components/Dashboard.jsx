
function Dashboard({

  userData,

  setVista

}) {

  console.log(
    userData
  )

  const rol =
    userData?.rol?.toLowerCase()

  return (

    <div
      className="p-6"
    >

      <h1
        className="
          text-3xl
          font-bold
          mb-6
        "
      >

        Dashboard

      </h1>

      {

        (
          rol === 'direccion'

          ||

          rol === 'administracion'
        )

        &&

        <div
    
className="
  flex
  flex-col
  md:flex-row
  gap-4
"


        >

          <button
            onClick={() =>
              setVista(
                'agenda'
              )
            }
          >

            Agenda mensual

          </button>

          <button
            onClick={() =>
              setVista(
                'tareas'
              )
            }
          >

            Tareas

          </button>

          <button
            onClick={() =>
              setVista(
                'profesionales'
              )
            }
          >

            Agenda profesionales

          </button>

        </div>
      }

      {

        (
          rol === 'profesional'

          ||

          rol === 'auxiliar'
        )

        &&

        <div
          className="
            flex
            gap-4
            flex-wrap
          "
        >

          <button
            onClick={() =>
              setVista(
                'miagenda'
              )
            }
          >

            Mi agenda

          </button>

          <button
            onClick={() =>
              setVista(
                'mistareas'
              )
            }
          >

            Mis tareas

          </button>

        </div>
      }

    </div>
  )
}

export default Dashboard
