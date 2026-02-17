import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DeviceService {
  
  isMobile(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  isTouchDevice(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  isPictureInPictureSupported(): boolean {
    // Verifica se não é mobile E se tem suporte ao PiP
    return !this.isMobileDevice() && 
           document.pictureInPictureEnabled && 
           typeof HTMLVideoElement.prototype.requestPictureInPicture === 'function' &&
           this.isSupportedBrowser();
  }

  // Detecção mais robusta para móveis
  private isMobileDevice(): boolean {
    const userAgent = navigator.userAgent;
    
    // iOS
    if (/iPad|iPhone|iPod/.test(userAgent)) return true;
    
    // Android
    if (/Android/.test(userAgent)) return true;
    
    // Windows Phone
    if (/Windows Phone/.test(userAgent)) return true;
    
    // Outros dispositivos móveis
    if (/Mobile|Tablet/.test(userAgent)) return true;
    
    // Touch device com tela pequena
    if ('ontouchstart' in window && window.innerWidth < 768) return true;
    
    return false;
  }

  private isSupportedBrowser(): boolean {
    // Verificar se é um browser conhecido que suporta canvas streams em PiP
    const userAgent = navigator.userAgent;
    const isChrome = /Chrome/.test(userAgent) && /Google Inc/.test(navigator.vendor);
    const isEdge = /Edg/.test(userAgent);
    const isFirefox = /Firefox/.test(userAgent);
    
    return isChrome || isEdge || isFirefox;
  }

  // Método auxiliar para outras verificações
  isMobileOrTablet(): boolean {
    return this.isMobileDevice() || (window.innerWidth <= 768) || this.isTouchDevice();
  }
}