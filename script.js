// ===== GENERAR QR CON API DE QRSERVER =====
function generarQR() {
    const artista = document.getElementById('artista').value.trim() || 'Anónimo';
    const fecha = document.getElementById('fecha').value || 'Fecha no especificada';
    const contacto = document.getElementById('contacto').value.trim() || 'Sin contacto';
    const cliente = document.getElementById('cliente').value.trim() || 'Sin cliente';
    const tiempo = document.getElementById('tiempo').value.trim() || 'No especificado';
    
    const textoQR = `Certificación: KinArtProtect
Artista: ${artista}
Fecha de creación: ${fecha}
Contacto: ${contacto}
Cliente: ${cliente}
Tiempo de creación: ${tiempo}`;
    
    const container = document.getElementById('qrContainer');
    container.classList.add('active');
    
    const qrDiv = document.getElementById('qrcode');
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
    
    document.getElementById('infoArtista').innerHTML = `
        <strong>Artista:</strong> ${artista} | 
        <strong>Cliente:</strong> ${cliente} | 
        <strong>Fecha:</strong> ${fecha}
    `;
}

// ===== DESCARGAR QR =====
function descargarQR() {
    const img = document.querySelector('#qrcode img');
    if (!img) {
        alert('Primero genera el QR');
        return;
    }
    
    const link = document.createElement('a');
    link.download = 'qr-kinartprotect.png';
    link.href = img.src;
    link.click();
}

// ===== AUTO-GENERAR AL CARGAR =====
window.onload = function() {
    generarQR();
};