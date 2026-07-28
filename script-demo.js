// ============================================
// CONFIGURACIÓN DE SUPABASE
// ============================================
const SUPABASE_URL = 'https://tgeuouzusahpwgjfciko.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnZXVvdXp1c2FocHdnamZjaWtvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNzk2NjgsImV4cCI6MjEwMDc1NTY2OH0.dDMkWqsb1t5uYg7z5vLFtXdS3gsLTYbh4r4m_1JBq-o';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================
// VARIABLES GLOBALES
// ============================================
let deviceHash = '';
let limitePorDefecto = 5;
let usuarioExiste = false;

// ============================================
// 1. GENERAR HUELLA DE DISPOSITIVO
// ============================================
async function generarHuellaDispositivo() {
    const datos = {
        userAgent: navigator.userAgent,
        idioma: navigator.language,
        zonaHoraria: Intl.DateTimeFormat().resolvedOptions().timeZone,
        pantalla: `${screen.width}x${screen.height}`,
        profundidadColor: screen.colorDepth,
        plataforma: navigator.platform,
        memoria: navigator.deviceMemory || 0,
        nucleos: navigator.hardwareConcurrency || 0
    };
    
    const texto = JSON.stringify(datos);
    const encoder = new TextEncoder();
    const data = encoder.encode(texto);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return hashHex;
}

// ============================================
// 2. OBTENER ESTADO DEL USUARIO (SOLO LECTURA)
// ============================================
async function obtenerEstadoUsuario() {
    try {
        if (!deviceHash) {
            deviceHash = await generarHuellaDispositivo();
        }
        console.log('🔑 Device Hash:', deviceHash);
        
        // Consultar estado actual en Supabase (SOLO LECTURA)
        const { data, error } = await supabaseClient
            .from('usos_temporales')
            .select('contador, limite_usos, fecha_expiracion')
            .eq('device_hash', deviceHash)
            .order('fecha_inicio', { ascending: false })
            .limit(1);
        
        if (error) {
            console.error('Error al obtener estado:', error);
            return { 
                existe: false, 
                contador: 0, 
                limite: limitePorDefecto, 
                usosRestantes: limitePorDefecto,
                mensaje: 'Error al verificar el estado' 
            };
        }
        
        // Si no hay registros, es nuevo usuario
        if (!data || data.length === 0) {
            usuarioExiste = false;
            return { 
                existe: false, 
                contador: 0, 
                limite: limitePorDefecto, 
                usosRestantes: limitePorDefecto,
                mensaje: '¡Bienvenido! Tienes 5 usos gratuitos.' 
            };
        }
        
        usuarioExiste = true;
        const registro = data[0];
        const fechaExpiracion = new Date(registro.fecha_expiracion);
        const ahora = new Date();
        
        // Verificar si expiró
        if (ahora > fechaExpiracion) {
            return { 
                existe: true, 
                contador: registro.contador, 
                limite: registro.limite_usos || limitePorDefecto,
                usosRestantes: 0,
                mensaje: '⏰ Tu prueba ha expirado. ¡Regístrate para continuar!',
                expirado: true
            };
        }
        
        // Usuario existente y activo
        const contador = registro.contador;
        const limite = registro.limite_usos || limitePorDefecto;
        const restantes = Math.max(0, limite - contador);
        
        let mensaje = `Te quedan ${restantes} usos gratuitos`;
        if (restantes === 0) {
            mensaje = '🚫 Has agotado tus usos gratuitos. ¡Regístrate para continuar!';
        } else if (restantes === 1) {
            mensaje = '⚠️ ¡Último uso gratuito!';
        }
        
        return { 
            existe: true, 
            contador: contador, 
            limite: limite, 
            usosRestantes: restantes,
            mensaje: mensaje
        };
        
    } catch (error) {
        console.error('Error en obtenerEstadoUsuario:', error);
        return { 
            existe: false, 
            contador: 0, 
            limite: limitePorDefecto, 
            usosRestantes: limitePorDefecto,
            mensaje: 'Error al verificar el estado' 
        };
    }
}

// ============================================
// 3. REGISTRAR UN NUEVO USO (SOLO AL GENERAR QR)
// ============================================
async function registrarUso() {
    try {
        // Primero, obtener el estado actual (sin modificar)
        const estado = await obtenerEstadoUsuario();
        
        // Si ya no tiene usos disponibles o expiró
        if (estado.usosRestantes <= 0 || estado.expirado) {
            return { 
                permitido: false, 
                usosRestantes: estado.usosRestantes, 
                mensaje: estado.expirado ? '⏰ Tu prueba ha expirado. ¡Regístrate para continuar!' : '🚫 Has agotado tus usos gratuitos.' 
            };
        }
        
        // Si es nuevo usuario, crear el primer registro
        if (!usuarioExiste) {
            // Insertar con contador = 1
            const { error: insertError } = await supabaseClient
                .from('usos_temporales')
                .insert({
                    device_hash: deviceHash,
                    user_agent: navigator.userAgent,
                    contador: 1,
                    limite_usos: limitePorDefecto,
                    fecha_expiracion: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 horas
                });
            
            if (insertError) {
                console.error('Error al crear registro:', insertError);
                return { permitido: false, mensaje: 'Error al registrar el uso' };
            }
            
            usuarioExiste = true;
            const restantes = limitePorDefecto - 1;
            return { 
                permitido: true, 
                usosRestantes: restantes, 
                mensaje: restantes > 0 ? `Te quedan ${restantes} usos gratuitos` : '⚠️ ¡Último uso gratuito!' 
            };
        }
        
        // Si ya existe, incrementar el contador
        const nuevoContador = estado.contador + 1;
        const { error: updateError } = await supabaseClient
            .from('usos_temporales')
            .update({
                contador: nuevoContador,
                fecha_ultimo_uso: new Date().toISOString()
            })
            .eq('device_hash', deviceHash);
        
        if (updateError) {
            console.error('Error al actualizar contador:', updateError);
            return { permitido: false, mensaje: 'Error al actualizar el contador' };
        }
        
        const restantes = estado.limite - nuevoContador;
        let mensaje = restantes > 0 ? `Te quedan ${restantes} usos gratuitos` : '⚠️ ¡Último uso gratuito!';
        
        return { 
            permitido: true, 
            usosRestantes: restantes, 
            mensaje: mensaje 
        };
        
    } catch (error) {
        console.error('Error en registrarUso:', error);
        return { permitido: false, mensaje: 'Error al registrar el uso' };
    }
}

// ============================================
// 4. ACTUALIZAR CONTADOR EN LA INTERFAZ
// ============================================
function actualizarContador(usosRestantes, mensaje) {
    const contadorElement = document.getElementById('usosDisponibles');
    const mensajeElement = document.getElementById('mensajeUso');
    const btnGenerar = document.getElementById('btnGenerar');
    const mensajeContainer = document.getElementById('mensajeUsoContainer');
    
    if (contadorElement) {
        contadorElement.textContent = Math.max(0, usosRestantes);
    }
    
    if (mensajeElement && mensaje) {
        mensajeElement.textContent = mensaje;
        
        // Cambiar color según el mensaje
        if (mensaje.includes('agotado') || mensaje.includes('Error') || mensaje.includes('expirado')) {
            mensajeElement.style.color = '#d32f2f';
            if (btnGenerar) {
                btnGenerar.disabled = true;
                btnGenerar.textContent = '🚫 Usos agotados';
            }
        } else if (mensaje.includes('Último uso') || mensaje.includes('1 uso')) {
            mensajeElement.style.color = '#e65100';
            if (btnGenerar) {
                btnGenerar.disabled = false;
                btnGenerar.textContent = '🎨 Generar QR';
            }
        } else {
            mensajeElement.style.color = '#2e7d32';
            if (btnGenerar) {
                btnGenerar.disabled = false;
                btnGenerar.textContent = '🎨 Generar QR';
            }
        }
    }
    
    // Mostrar mensaje adicional
    if (mensajeContainer && mensaje) {
        let clase = 'mensaje-uso info';
        if (mensaje.includes('agotado') || mensaje.includes('expirado')) {
            clase = 'mensaje-uso error';
        } else if (mensaje.includes('Último uso')) {
            clase = 'mensaje-uso warning';
        } else if (mensaje.includes('Bienvenido')) {
            clase = 'mensaje-uso success';
        }
        
        mensajeContainer.innerHTML = `<div class="${clase}">${mensaje}</div>`;
    }
}

// ============================================
// 5. GENERAR QR (DEMO)
// ============================================
async function generarQRDemo() {
    const btnGenerar = document.getElementById('btnGenerar');
    if (!btnGenerar) return;
    
    btnGenerar.disabled = true;
    btnGenerar.textContent = '⏳ Verificando...';
    
    // Registrar el uso (solo aquí se incrementa el contador)
    const resultado = await registrarUso();
    
    if (!resultado.permitido) {
        actualizarContador(resultado.usosRestantes || 0, resultado.mensaje);
        btnGenerar.disabled = false;
        btnGenerar.textContent = '🎨 Generar QR';
        return;
    }
    
    // Actualizar contador en la interfaz
    actualizarContador(resultado.usosRestantes, resultado.mensaje);
    
    // Generar QR
    const artista = document.getElementById('artista').value.trim() || 'Anónimo';
    const fecha = document.getElementById('fecha').value || 'Fecha no especificada';
    const contacto = document.getElementById('contacto').value.trim() || 'Sin contacto';
    const cliente = document.getElementById('cliente').value.trim() || 'Sin cliente';
    const tiempo = document.getElementById('tiempo').value.trim() || 'No especificado';
    
    const textoQR = `Certificación: KinArtProtect (Demo)
Artista: ${artista}
Fecha de creación: ${fecha}
Contacto: ${contacto}
Cliente: ${cliente}
Tiempo de creación: ${tiempo}
Generado: ${new Date().toLocaleDateString()}`;
    
    const container = document.getElementById('qrContainer');
    if (container) {
        container.classList.add('active');
    }
    
    const qrDiv = document.getElementById('qrcode');
    if (qrDiv) {
        qrDiv.innerHTML = '';
        
        const url = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(textoQR)}&color=2c1810&bgcolor=ffffff&margin=20`;
        
        const img = document.createElement('img');
        img.src = url;
        img.alt = 'QR Code';
        img.style.width = '250px';
        img.style.height = '250px';
        img.id = 'qrImage';
        img.onerror = function() {
            alert('Error al generar el QR. Verifica tu conexión a internet.');
        };
        qrDiv.appendChild(img);
    }
    
    const infoArtista = document.getElementById('infoArtista');
    if (infoArtista) {
        infoArtista.innerHTML = `
            <strong>Artista:</strong> ${artista} | 
            <strong>Cliente:</strong> ${cliente} | 
            <strong>Fecha:</strong> ${fecha} | 
            <span style="color: #2e7d32;">🎯 Demo</span>
        `;
    }
    
    btnGenerar.disabled = false;
    btnGenerar.textContent = '🎨 Generar QR';
    
    console.log('✅ QR generado en modo demo. Usos restantes:', resultado.usosRestantes);
}

// ============================================
// 6. DESCARGAR QR (DEMO)
// ============================================
function descargarQRDemo() {
    const img = document.querySelector('#qrcode img');
    if (!img) {
        alert('Primero genera el QR');
        return;
    }
    
    const link = document.createElement('a');
    link.download = 'qr-kinartprotect-demo.png';
    link.href = img.src;
    link.click();
}

// ============================================
// 7. INICIALIZAR AL CARGAR LA PÁGINA
// ============================================
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🎨 KinArtProtect - Demo cargado');
    
    // Generar device hash al inicio
    deviceHash = await generarHuellaDispositivo();
    
    // Solo mostrar el estado, sin modificar nada
    const estado = await obtenerEstadoUsuario();
    actualizarContador(estado.usosRestantes, estado.mensaje);
    
    console.log('📊 Estado inicial:', estado);
});