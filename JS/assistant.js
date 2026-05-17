/**
 * assistant.js
 * Asistente Virtual Inteligente para TaskFlow
 * Responde preguntas frecuentes y ayuda a los usuarios
 */

let asistente = null; // Variable global para el asistente

const VA_PREGUNTAS_FRECUENTES = {
  // AUTENTICACIÓN
  'login|iniciar sesion|entrar|acceso|credenciales': {
    respuesta: '📧 **Para iniciar sesión:**\n\n1. Ingresa tu email y contraseña\n2. Haz clic en "Iniciar sesión"\n3. ¿Olvidaste tu contraseña? Haz clic en "¿Olvidaste tu contraseña?"\n\n💡 **Demo:** admin@creativehub.com / 12345678',
    categoria: 'autenticacion'
  },
  'registro|crear cuenta|registrarse|nueva cuenta': {
    respuesta: '📝 **Para crear una cuenta:**\n\n1. Haz clic en "Regístrate aquí"\n2. Completa: Nombre, Email, Contraseña\n3. Selecciona tu rol (Admin, Gerente o Empleado)\n4. Haz clic en "Crear cuenta"\n\n✅ ¡Tu cuenta estará lista inmediatamente!',
    categoria: 'autenticacion'
  },
  'olvidé contraseña|recuperar contraseña|cambiar contraseña|reset password': {
    respuesta: '🔐 **Para recuperar tu contraseña:**\n\n1. En la pantalla de login, haz clic en "¿Olvidaste tu contraseña?"\n2. Ingresa tu email\n3. Recibirás un enlace para restablecer\n4. Sigue el enlace y crea una nueva contraseña\n\n⏱️ El enlace expira en 1 hora',
    categoria: 'autenticacion'
  },

  // PROYECTOS
  'crear proyecto|nuevo proyecto|proyecto': {
    respuesta: '📊 **Para crear un proyecto:**\n\n1. Haz clic en "+ Nuevo Proyecto"\n2. Completa:\n   - Nombre del proyecto\n   - Descripción (opcional)\n   - Color (elige tu favorito)\n   - Fechas de inicio y fin\n3. Haz clic en "Crear"\n\n💡 Puedes editar el proyecto después haciendo clic en el ⚙️',
    categoria: 'proyectos'
  },
  'agregar miembro|invitar|equipo|miembros': {
    respuesta: '👥 **Para agregar miembros al proyecto:**\n\n1. Abre el proyecto\n2. Haz clic en "+ Miembro"\n3. Selecciona a los usuarios de la lista\n4. Asigna rol (Admin, Gerente o Empleado)\n5. Haz clic en "Agregar"\n\n📌 Solo Admin y Gerentes pueden agregar miembros',
    categoria: 'proyectos'
  },
  'roles|rol|que roles|qué roles|existen roles|permisos|admin|gerente|empleado': {
    respuesta: '🎓 **Roles en TaskFlow:**\n\n👨‍💼 **Admin:** Acceso total, puede eliminar proyectos\n👔 **Gerente:** Crea proyectos, asigna tareas\n👨‍💻 **Empleado:** Completa tareas asignadas\n\n💡 El creador del proyecto es automáticamente Admin',
    categoria: 'proyectos'
  },

  // TAREAS
  'crear tarea|nueva tarea|tarea': {
    respuesta: '✅ **Para crear una tarea:**\n\n1. Abre un proyecto\n2. Haz clic en "+ Nueva Tarea"\n3. Completa:\n   - Nombre (obligatorio)\n   - Descripción\n   - Prioridad (Alta, Media, Baja)\n   - Asignar a alguien\n4. Haz clic en "Crear"\n\n🎯 Las tareas comienzan en la columna "To Do"',
    categoria: 'tareas'
  },
  'kanban|columna|mover|drag drop|progress|review|done|todo': {
    respuesta: '📋 **Tablero Kanban (4 columnas):**\n\n**To Do** → Por hacer\n**Progress** → En progreso\n**Review** → En revisión\n**Done** → Completada\n\n🖱️ **Para mover una tarea:**\n1. Haz clic y mantén presionado sobre la tarea\n2. Arrastra a la nueva columna\n3. Suelta el ratón\n\n✨ Suave y fácil!',
    categoria: 'tareas'
  },
  'editar tarea|cambiar tarea|actualizar': {
    respuesta: '✏️ **Para editar una tarea:**\n\n1. Haz clic en la tarea que quieres editar\n2. Modifica lo que necesites:\n   - Nombre\n   - Descripción\n   - Prioridad\n   - Asignado a\n   - Fecha límite\n3. Haz clic en "Guardar cambios"\n\n🗑️ También puedes eliminar desde aquí',
    categoria: 'tareas'
  },
  'comentario|comentar|feedback|mensaje tarea': {
    respuesta: '💬 **Para comentar en una tarea:**\n\n1. Abre la tarea\n2. Desplázate al final (sección Comentarios)\n3. Escribe tu comentario\n4. Presiona Enter o haz clic en "Enviar"\n\n👥 Todos los miembros del proyecto pueden ver los comentarios',
    categoria: 'tareas'
  },
  'prioridad|urgencia|importante': {
    respuesta: '⚡ **Niveles de Prioridad:**\n\n🔴 **Alta:** Urgente, debe completarse pronto\n🟡 **Media:** Normal, importante pero sin prisa\n🟢 **Baja:** Puede esperar, no es urgente\n\n💡 Filtra por prioridad en los reportes',
    categoria: 'tareas'
  },

  // CRONÓMETRO
  'cronometro|timer|tiempo|registrar tiempo|time tracking': {
    respuesta: '⏱️ **Cómo usar el Cronómetro:**\n\n1. Abre una tarea\n2. Haz clic en el botón ⏱️ (cronómetro)\n3. El tiempo comienza a registrarse\n4. Aparecerá "⏸ Detener" cuando esté activo\n5. Haz clic en "Detener" cuando termines\n\n📊 El tiempo se guarda automáticamente en la BD',
    categoria: 'cronometro'
  },
  'tiempo transcurrido|segundos|horas|minutos registrados': {
    respuesta: '📈 **Para ver tu tiempo:**\n\n1. Ve a "Dashboard" (arriba a la derecha)\n2. Mira "Tiempo registrado hoy"\n3. Ve a "Reportes" para histórico completo\n4. Filtrar por proyecto o período\n\n⏳ El tiempo se actualiza en tiempo real',
    categoria: 'cronometro'
  },

  // DASHBOARD
  'dashboard|resumen|estadisticas|metricas': {
    respuesta: '📊 **Tu Dashboard muestra:**\n\n📁 Proyectos activos\n📋 Tareas pendientes\n🔴 Tareas de alta prioridad\n⏱️ Tiempo registrado hoy\n📝 Tareas recientes\n\n💡 Se actualiza automáticamente cada minuto',
    categoria: 'dashboard'
  },

  // REPORTES
  'reportes|analytics|datos|analisis': {
    respuesta: '📈 **Tipos de Reportes:**\n\n👥 **Usuarios:** Tareas por persona\n⏱️ **Tiempo:** Historial de horas registradas\n📊 **Proyectos:** Progreso general\n\n🔗 Accede desde "Reportes" en el menú principal',
    categoria: 'reportes'
  },

  // PREFERENCIAS
  'accesibilidad|contraste|fuente|modo oscuro|tema': {
    respuesta: '♿ **Opciones de Accesibilidad:**\n\n🎨 **Alto Contraste:** Más visible\n📝 **Fuente Dyslexia:** Más fácil de leer\n👁️ **Modo Enfoque:** Reduce distracciones\n📏 **Tamaño de fuente:** Normal / Grande / XL\n\n⚙️ Accede desde tu Perfil → Preferencias',
    categoria: 'accesibilidad'
  },

  // CHAT
  'chat|mensaje|comunicacion|equipo': {
    respuesta: '💬 **Chat del Equipo:**\n\n1. Haz clic en "Chat" (último tab)\n2. Escribe tu mensaje\n3. Presiona Enter\n\n✨ Todos en el proyecto ven el mensaje\n📌 Excelente para comunicación rápida',
    categoria: 'chat'
  },

  // PERFIL
  'perfil|nombre|email|información|usuario': {
    respuesta: '👤 **Para editar tu Perfil:**\n\n1. Haz clic en tu avatar (arriba a la derecha)\n2. Selecciona "Mi Perfil"\n3. Edita:\n   - Nombre\n   - Teléfono\n   - Empresa\n4. Haz clic en "Guardar"\n\n🔐 Solo tú puedes editar tu perfil',
    categoria: 'perfil'
  },
  'contraseña|cambiar contraseña|seguridad': {
    respuesta: '🔐 **Para cambiar tu Contraseña:**\n\n1. Ve a "Mi Perfil"\n2. Haz clic en "Cambiar Contraseña"\n3. Ingresa contraseña actual\n4. Ingresa nueva contraseña (mín. 8 caracteres)\n5. Confirma\n6. Haz clic en "Actualizar"\n\n✅ La contraseña se actualiza inmediatamente',
    categoria: 'perfil'
  },

  // GENERAL
  'ayuda|soporte|problema|error|no funciona': {
    respuesta: '🆘 **¿Necesitas ayuda?**\n\n📖 Revisa la documentación completa\n💬 Pregunta al asistente (yo!)\n🐛 Si encuentras un error, reporta los detalles\n⚙️ Intenta refrescar la página\n🔄 Limpia el caché del navegador\n\n💡 La mayoría de problemas se resuelven refrescando',
    categoria: 'soporte'
  },
  'keyboard shortcut|atajo|ctrl|command': {
    respuesta: '⌨️ **Atajos de Teclado:**\n\n⏎ Enter: Enviar mensaje o crear\n Esc: Cerrar modal\nCtrl+S: Guardar (algunos navegadores)\n\n💡 Se están agregando más atajos pronto',
    categoria: 'general'
  },

  // GENERAL HELP
  'que puedo hacer|funcionalidades|caracteristicas|features': {
    respuesta: '✨ **Funcionalidades de TaskFlow:**\n\n✅ Crear proyectos con tu equipo\n✅ Tablero Kanban con drag & drop\n✅ Registrar tiempo en tareas\n✅ Comentarios colaborativos\n✅ Reportes y analytics\n✅ Chat del equipo\n✅ Accesibilidad completa\n✅ Multi-roles (Admin, Gerente, Empleado)\n\n🚀 ¡Mucho más por venir!',
    categoria: 'general'
  },
  'como empiezo|tutorial|principiante|nuevo': {
    respuesta: '🎯 **Guía de Inicio Rápido:**\n\n1️⃣ Crea tu primer proyecto\n2️⃣ Agrega miembros del equipo\n3️⃣ Crea algunas tareas\n4️⃣ Intenta el Kanban (drag & drop)\n5️⃣ Inicia el cronómetro\n6️⃣ Mira tu dashboard\n7️⃣ Invita a tu equipo\n\n💡 ¡Todo es intuitivo, experimenta!',
    categoria: 'general'
  }
};

const MAX_TAREAS_ASISTENTE = 5;

const VA_RESPUESTAS_RAPIDAS = [
  { texto: '¿Cómo crear una tarea?', emoji: '✅' },
  { texto: '¿Cómo usar el cronómetro?', emoji: '⏱️' },
  { texto: '¿Cómo crear un proyecto?', emoji: '📁' },
  { texto: '¿Cómo cambiar mi contraseña?', emoji: '🔐' },
  { texto: '¿Qué roles existen?', emoji: '👥' },
  { texto: '¿Cómo ver mis reportes?', emoji: '📊' },
];

class AsistenteVirtual {
  constructor() {
    this.historial = [];
    this.abierto = false;
    this.filtroActual = null; // Categoría seleccionada
  }

  init() {
    this.crearBurbuja();
    this.setupEventos();
  }

  crearBurbuja() {
    const html = `
      <div id="va-burbuja" class="va-burbuja">
        <div class="va-burbuja-contenido">
          <span class="va-emoji">🤖</span>
          <div class="va-texto">
            <div class="va-titulo">Asistente Virtual</div>
            <div class="va-subtitulo">Estoy aquí para ayudarte</div>
          </div>
        </div>
      </div>

      <div id="va-chat" class="va-chat">
        <div class="va-header">
          <h3>🤖 Asistente Virtual</h3>
          <button class="va-close" id="va-close-btn">✕</button>
        </div>

        <div class="va-filtros-container">
          <div class="va-filtro-header">
            <div class="va-filtro-label">Categorías:</div>
            <button id="va-toggle-filtros" class="va-toggle-btn" title="Cerrar/Abrir filtros">−</button>
          </div>
          <div class="va-filtros-wrapper" id="va-filtros-wrapper">
            <div class="va-filtros" id="va-filtros">
              <button class="va-filtro-btn va-filtro-activo" data-filtro="todos">📋 Todos</button>
              <button class="va-filtro-btn" data-filtro="autenticacion">🔐 Autenticación</button>
              <button class="va-filtro-btn" data-filtro="proyectos">📁 Proyectos</button>
              <button class="va-filtro-btn" data-filtro="tareas">✅ Tareas</button>
              <button class="va-filtro-btn" data-filtro="cronometro">⏱️ Cronómetro</button>
              <button class="va-filtro-btn" data-filtro="dashboard">📊 Dashboard</button>
              <button class="va-filtro-btn" data-filtro="reportes">📈 Reportes</button>
              <button class="va-filtro-btn" data-filtro="chat">💬 Chat</button>
              <button class="va-filtro-btn" data-filtro="perfil">👤 Perfil</button>
              <button class="va-filtro-btn" data-filtro="accesibilidad">♿ Accesibilidad</button>
            </div>
            <div id="va-preguntas-dropdown" class="va-preguntas-dropdown" style="display:none;">
              <div class="va-pregunta-label">Preguntas disponibles:</div>
              <div id="va-lista-preguntas" class="va-lista-preguntas"></div>
            </div>
          </div>
        </div>

        <div class="va-messages" id="va-messages">
          <div class="va-msg-bot">
            <div class="va-bubble">Hola! 👋 Soy tu asistente. Selecciona una categoría arriba o pregúntame sobre cómo usar TaskFlow.</div>
            <div style="font-size:0.75rem;color:var(--t2);margin-top:8px;text-align:right">Hace un momento</div>
          </div>
        </div>

        <div class="va-quick-replies" id="va-quick-replies">
          ${VA_RESPUESTAS_RAPIDAS.map(r => `
            <button class="va-quick-btn" onclick="asistente.enviarRapido('${r.texto}')">
              ${r.emoji} ${r.texto}
            </button>
          `).join('')}
        </div>
        <div class="va-input-area">
          <input
            type="text"
            id="va-input"
            class="va-input"
            placeholder="Escribe tu pregunta..."
            autocomplete="off"
          >
          <button class="va-send" id="va-send-btn">▶</button>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
  }

  setupEventos() {
    const burbuja = document.getElementById('va-burbuja');
    const input = document.getElementById('va-input');
    const closeBtn = document.getElementById('va-close-btn');
    const sendBtn = document.getElementById('va-send-btn');
    const filtrosBtns = document.querySelectorAll('.va-filtro-btn');

    if (burbuja) {
      burbuja.addEventListener('click', () => this.abrir());
    }

    if (input) {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.enviar();
        }
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.cerrar());
    }

    if (sendBtn) {
      sendBtn.addEventListener('click', () => this.enviar());
    }

    // Agregar listeners a los botones de filtro
    filtrosBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const filtro = e.target.dataset.filtro;
        this.establecerFiltro(filtro);
      });
    });

    // Listener para toggle de filtros
    const toggleBtn = document.getElementById('va-toggle-filtros');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this.toggleFiltros());
    }
  }

  toggleFiltros() {
    const wrapper = document.getElementById('va-filtros-wrapper');
    const toggleBtn = document.getElementById('va-toggle-filtros');

    if (wrapper.classList.contains('va-cerrado')) {
      wrapper.classList.remove('va-cerrado');
      toggleBtn.textContent = '−';
      toggleBtn.title = 'Cerrar filtros';
    } else {
      wrapper.classList.add('va-cerrado');
      toggleBtn.textContent = '+';
      toggleBtn.title = 'Abrir filtros';
    }
  }

  abrir() {
    this.abierto = true;
    const chat = document.getElementById('va-chat');
    if(chat) chat.classList.add('va-open');
    const burbuja = document.getElementById('va-burbuja');
    if(burbuja) burbuja.style.display = 'none';
  
    // Restaurar chips al abrir
    const chips = document.getElementById('va-quick-replies');
    if(chips) chips.style.display = 'flex';
  
    setTimeout(() => {
      const input = document.getElementById('va-input');
      if(input) input.focus();
    }, 100);
  }

  cerrar() {
    this.abierto = false;
    const chat = document.getElementById('va-chat');
    if(chat) chat.classList.remove('va-open');
    const burbuja = document.getElementById('va-burbuja');
    if(burbuja) burbuja.style.display = 'flex';
  }

  enviar() {
    const input = document.getElementById('va-input');
    const pregunta = input?.value?.trim();
  
    if (!pregunta) return;
  
    this.agregarMensaje('usuario', pregunta);
    input.value = '';
  
    const respuesta = this.procesarPregunta(pregunta);
    setTimeout(() => {
      this.agregarMensaje('bot', respuesta);
    }, 500);
  
    // Ocultar chips al enviar cualquier mensaje
    const chips = document.getElementById('va-quick-replies');
    if(chips) chips.style.display = 'none';
  }

  enviarRapido(texto) {
    // Resetear filtro para buscar en todas las categorías
    this.filtroActual = null;
    
    // Resetear visual de botones de categoría
    document.querySelectorAll('.va-filtro-btn').forEach(btn => {
      btn.classList.remove('va-filtro-activo');
    });
    document.querySelector('[data-filtro="todos"]')?.classList.add('va-filtro-activo');
  
    const input = document.getElementById('va-input');
    if(input) input.value = texto;
    this.enviar();
    const chips = document.getElementById('va-quick-replies');
    if(chips) chips.style.display = 'none';
  }

  establecerFiltro(categoria) {
    this.filtroActual = categoria === 'todos' ? null : categoria;

    // Actualizar estilo de botones
    const botones = document.querySelectorAll('.va-filtro-btn');
    botones.forEach(btn => {
      if (btn.dataset.filtro === categoria) {
        btn.classList.add('va-filtro-activo');
      } else {
        btn.classList.remove('va-filtro-activo');
      }
    });

    // Mostrar dropdown de preguntas
    this.mostrarPreguntasDropdown();

    // Mostrar sugerencias de la categoría seleccionada
    let mensaje = this.obtenerSugerencias();
    this.agregarMensaje('bot', mensaje);

    // Ocultar chips de respuesta rápida al seleccionar categoría
    const chips = document.getElementById('va-quick-replies');
    if(chips) chips.style.display = 'none';
  }

  mostrarPreguntasDropdown() {
    const dropdown = document.getElementById('va-preguntas-dropdown');
    const listaPreguntasDiv = document.getElementById('va-lista-preguntas');

    if (!this.filtroActual) {
      if (dropdown) dropdown.style.display = 'none';
      return;
    }

    const preguntas = [];
    for (const [palabras, data] of Object.entries(VA_PREGUNTAS_FRECUENTES)) {
      if (data.categoria === this.filtroActual) {
        const todasLasPalabras = palabras.split('|');
        preguntas.push(todasLasPalabras[0]); // Primera opción
      }
    }

    if (preguntas.length === 0) {
      if (dropdown) dropdown.style.display = 'none';
      return;
    }

    // Crear botones de preguntas
    listaPreguntasDiv.innerHTML = '';
    preguntas.slice(0, MAX_TAREAS_ASISTENTE).forEach(pregunta => {
      const btn = document.createElement('button');
      btn.className = 'va-pregunta-btn';
      btn.textContent = pregunta;
      btn.addEventListener('click', () => {
        const input = document.getElementById('va-input');
        if (input) {
          input.value = pregunta;
          this.enviar();
        }
      });
      listaPreguntasDiv.appendChild(btn);
    });
    
    if(preguntas.length > MAX_TAREAS_ASISTENTE) {
      const mas = document.createElement('div');
      mas.style.cssText = 'font-size:.7rem;color:var(--t2);text-align:center;padding:6px';
      mas.textContent = `+ ${preguntas.length - MAX_TAREAS_ASISTENTE} preguntas más. Escribe para buscar.`;
      listaPreguntasDiv.appendChild(mas);
    }

    if (dropdown) dropdown.style.display = 'block';
  }

  obtenerSugerencias() {
    if (!this.filtroActual) {
      return '📚 Mostrando todas las categorías. Selecciona una categoría o escribe tu pregunta.';
    }

    const preguntas = [];
    for (const [palabras, data] of Object.entries(VA_PREGUNTAS_FRECUENTES)) {
      if (data.categoria === this.filtroActual) {
        const primeraPreg = palabras.split('|')[0];
        preguntas.push(`• ${primeraPreg}`);
      }
    }

    if (preguntas.length === 0) {
      return `😅 No hay preguntas en esta categoría.`;
    }

    const categoriaEmoji = {
      'autenticacion': '🔐',
      'proyectos': '📁',
      'tareas': '✅',
      'cronometro': '⏱️',
      'dashboard': '📊',
      'reportes': '📈',
      'chat': '💬',
      'perfil': '👤',
      'accesibilidad': '♿',
      'soporte': '🆘',
      'general': '✨'
    };

    const emoji = categoriaEmoji[this.filtroActual] || '📋';
    return `${emoji} **Preguntas sobre ${this.filtroActual}:**\n\n${preguntas.slice(0, 5).join('\n')}\n\n💡 Escribe tu pregunta o selecciona un tema`;
  }

  normalizarTexto(texto) {
    return texto.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, '')
      .replace(/\bcreo\b/g, 'crear')
      .replace(/\bhago\b/g, 'hacer')
      .replace(/\bpuedo\b/g, 'poder')
      .replace(/\bquiero\b/g, 'querer')
      .replace(/\btengo\b/g, 'tener')
      .replace(/\bveo\b/g, 'ver')
      .replace(/\bmuevo\b/g, 'mover')
      .replace(/\bagrego\b/g, 'agregar')
      .replace(/\bedito\b/g, 'editar')
      .replace(/\belimino\b/g, 'eliminar')
      .replace(/\binicio\b/g, 'iniciar')
      .replace(/\bcierro\b/g, 'cerrar')
      .replace(/\bcambio\b/g, 'cambiar')
      .replace(/\bguardo\b/g, 'guardar')
      .replace(/\bregistro\b/g, 'registrar')
      .replace(/\benvio\b/g, 'enviar')
      .replace(/\bveo\b/g, 'ver')
      .replace(/\baccedo\b/g, 'acceder')
      .replace(/\bconecto\b/g, 'conectar')
      .replace(/\bactualizo\b/g, 'actualizar');
  }

  calcularSimilitud(texto1, texto2) {
    const a = this.normalizarTexto(texto1);
    const b = this.normalizarTexto(texto2);
  
    // Palabras irrelevantes que no deben contar
    const stopWords = new Set(['el','la','los','las','un','una','unos','unas',
      'de','del','al','en','con','por','para','que','que','como','cuando',
      'donde','quien','cual','hola','buenas','hey','ola','como','estas',
      'esta','esto','ese','esa','hay','es','son','ser','estar','tengo',
      'tiene','quiero','quiere','necesito','me','te','se','si','no','yo',
      'tu','el','mi','su','que','qué','cómo','cuál','cuándo','dónde','hora',
      'dia','hoy','tiempo','cosa','algo','todo','nada','muy','bien','mal']);
  
    // Coincidencia exacta
    if (a === b) return 100;
    if (a.includes(b) && b.length > 5) return 80;
  
    // Contar palabras relevantes que coinciden
    const palabrasA = a.split(/\s+/).filter(p => p.length > 3 && !stopWords.has(p));
    const palabrasB = b.split(/\s+/).filter(p => p.length > 3 && !stopWords.has(p));
  
    if(palabrasA.length === 0 || palabrasB.length === 0) return 0;
  
    let coincidencias = 0;
    for (const pa of palabrasA) {
      for (const pb of palabrasB) {
        if (pa === pb) coincidencias += 30;
        else if (pa.includes(pb) || pb.includes(pa)) coincidencias += 15;
      }
    }
    return coincidencias;
  }

  procesarPregunta(pregunta) {
    const pNormalizada = this.normalizarTexto(pregunta);
    let mejorMatch = null;
    let mejorPuntaje = 0;

    // Buscar coincidencias con puntuación
    for (const [palabras, data] of Object.entries(VA_PREGUNTAS_FRECUENTES)) {
      // Si hay filtro activo, solo buscar en esa categoría
      if (this.filtroActual && data.categoria !== this.filtroActual) {
        continue;
      }

      const palabrasArray = palabras.split('|');
      for (const palabra of palabrasArray) {
        const puntaje = this.calcularSimilitud(pNormalizada, palabra);
        if (puntaje > mejorPuntaje) {
          mejorPuntaje = puntaje;
          mejorMatch = data;
        }
      }
    }

    // Si encontró una coincidencia razonable
    if (mejorMatch && mejorPuntaje >= 40) {
      return mejorMatch.respuesta;
    }

    // Si no encuentra coincidencia
    return `❓ No encontré una respuesta.\n\nIntenta con otras palabras o revisa la sección de <strong>Ayuda</strong>.\n\n💡 Sugerencias:\n• Sé más específico (ej: "cómo crear tarea")\n• Cambia de categoría con los filtros\n• Escribe "ayuda" para ver opciones`;

  }

  agregarMensaje(tipo, texto) {
    const messagesDiv = document.getElementById('va-messages');
    const ahora = new Date();
    const hora = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    const msgHTML = tipo === 'usuario' ? `
      <div class="va-msg-user">
        <div style="font-size:0.75rem;color:var(--t2);margin-bottom:6px;text-align:right">Hace un momento</div>
        <div class="va-bubble va-bubble-user">${texto}</div>
      </div>
    ` : `
      <div class="va-msg-bot">
        <div class="va-bubble">${texto.replace(/\n/g, '<br>')}</div>
        <div style="font-size:0.75rem;color:var(--t2);margin-top:6px;text-align:right">${hora}</div>
      </div>
    `;

    messagesDiv.insertAdjacentHTML('beforeend', msgHTML);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  asistente = new AsistenteVirtual();
  asistente.init();
});

// Si el script carga después de DOMContentLoaded
if (document.readyState !== 'loading') {
  setTimeout(() => {
    if (!asistente) {
      asistente = new AsistenteVirtual();
      asistente.init();
    }
  }, 100);
}
