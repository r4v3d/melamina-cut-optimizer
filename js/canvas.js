// Renderizador del Mapa de Corte con HTML5 Canvas - MelaminaCut

import { escapeHtml, hexToRgba } from './utils.js';
import { CutOptimizer } from './optimizer.js';
import { isNativeApp, shareNativeFile } from './app/native.js';

export class CutMapCanvas {
    // options.onEdit({ type: 'rotate' | 'remove', part }) se llama tras una edición manual
    // options.onNotice(mensaje) muestra avisos (por defecto alert)
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.onEdit = options.onEdit || null;
        this.notify = options.onNotice || (msg => alert(msg));
        this.onHoverPart = options.onHoverPart || null; // (pieza | null) al pasar el mouse
        this.highlightRowId = null; // resalta las piezas de una fila de la tabla
        this.grooveSpec = { offset: 15, width: 4, depth: 8 };
        this.ctx = this.canvas.getContext('2d');
        this.wrapper = this.canvas.parentElement;
        if (this.wrapper) {
            this.wrapper.style.position = 'relative';
        }
        
        this.sheet = null;
        this.scale = 1.0;
        this.panX = 0;
        this.panY = 0;
        this.activeCutIndex = -1;
        this.completedCutIndex = -1; // pasos marcados como hechos (inclusive)
        
        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;
        
        this.hoveredPart = null;
        this.hoveredRect = null;
        
        this.tooltipEl = this.createTooltipElement();
        this.closeMenuBind = this.hideContextMenu.bind(this);
        
        this.initEvents();
    }

    createTooltipElement() {
        let el = document.getElementById('canvas-tooltip');
        if (!el) {
            el = document.createElement('div');
            el.id = 'canvas-tooltip';
            el.className = 'canvas-tooltip-style';
            
            // Add CSS for tooltip to style.css or inject here dynamically
            const style = document.createElement('style');
            style.textContent = `
                .canvas-tooltip-style {
                    position: absolute;
                    background: rgba(15, 23, 42, 0.95);
                    backdrop-filter: blur(8px);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    border-radius: 8px;
                    padding: 10px 14px;
                    color: #f8fafc;
                    font-size: 0.8rem;
                    pointer-events: none;
                    opacity: 0;
                    transition: opacity 0.15s;
                    z-index: 1000;
                    box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5);
                    font-family: 'Plus Jakarta Sans', sans-serif;
                }
                .canvas-tooltip-style h4 {
                    font-family: 'Outfit', sans-serif;
                    font-size: 0.9rem;
                    margin-bottom: 4px;
                    color: #f97316;
                }
                .canvas-tooltip-style p {
                    margin: 2px 0;
                    color: #94a3b8;
                }
                .canvas-tooltip-style strong {
                    color: #f8fafc;
                }
                .canvas-tooltip-style .badge {
                    display: inline-block;
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-size: 0.7rem;
                    font-weight: bold;
                    margin-top: 4px;
                }
                .canvas-tooltip-style .badge-delgado {
                    background: rgba(6, 182, 212, 0.2);
                    color: #06b6d4;
                }
                .canvas-tooltip-style .badge-grueso {
                    background: rgba(249, 115, 22, 0.2);
                    color: #f97316;
                }
            `;
            document.head.appendChild(style);
        }
        if (this.wrapper) {
            this.wrapper.appendChild(el);
        }
        return el;
    }

    initEvents() {
        // Drag/Pan Events
        this.wrapper.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return; // Left click only
            this.isDragging = true;
            this.startX = e.clientX - this.panX;
            this.startY = e.clientY - this.panY;
            this.wrapper.style.cursor = 'grabbing';
        });

        window.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                this.wrapper.style.cursor = 'grab';
            }
        });

        this.wrapper.addEventListener('mouseleave', () => {
            if (this.hoveredPart && this.onHoverPart) this.onHoverPart(null);
            this.hoveredPart = null;
            this.hoveredRect = null;
            if (this.tooltipEl) this.tooltipEl.style.opacity = '0';
            this.render();
        });

        this.wrapper.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                this.panX = e.clientX - this.startX;
                this.panY = e.clientY - this.startY;
                this.render();
            } else {
                this.handleMouseMove(e);
            }
        });

        // Zoom with wheel
        this.wrapper.addEventListener('wheel', (e) => {
            // Sin Ctrl la rueda hace scroll de la página (salvo en pantalla completa)
            if (!e.ctrlKey && !this.wrapper.closest('.fullscreen-map')) return;
            e.preventDefault();
            const zoomFactor = 1.1;
            
            // Get mouse position relative to wrapper
            const rect = this.wrapper.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            // Calculate virtual coordinates before zoom
            const virtualX = (mouseX - this.panX) / this.scale;
            const virtualY = (mouseY - this.panY) / this.scale;
            
            if (e.deltaY < 0) {
                this.scale = Math.min(this.scale * zoomFactor, 10.0); // zoom in
            } else {
                this.scale = Math.max(this.scale / zoomFactor, 0.1);  // zoom out
            }
            
            // Re-calculate pan to zoom towards mouse position
            this.panX = mouseX - virtualX * this.scale;
            this.panY = mouseY - virtualY * this.scale;
            
            this.render();
        }, { passive: false });

        // Touch support for mobile devices
        let touchStartDist = 0;
        let touchStartX = 0;
        let touchStartY = 0;
        let touchStartTime = 0;
        
        this.wrapper.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                this.isDragging = true;
                this.startX = e.touches[0].clientX - this.panX;
                this.startY = e.touches[0].clientY - this.panY;
                
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
                touchStartTime = Date.now();
                
                e.preventDefault();
            } else if (e.touches.length === 2) {
                touchStartDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                e.preventDefault();
            }
        }, { passive: false });

        this.wrapper.addEventListener('touchend', (e) => {
            if (this.isDragging) {
                this.isDragging = false;
                
                // Detect tap: duration < 300ms and movement < 10px
                const touchEndX = e.changedTouches[0]?.clientX || touchStartX;
                const touchEndY = e.changedTouches[0]?.clientY || touchStartY;
                const duration = Date.now() - touchStartTime;
                const distance = Math.hypot(touchEndX - touchStartX, touchEndY - touchStartY);
                
                if (duration < 300 && distance < 10) {
                    this.handleTap(touchEndX, touchEndY);
                }
            }
        });

        this.wrapper.addEventListener('touchmove', (e) => {
            if (this.isDragging && e.touches.length === 1) {
                this.panX = e.touches[0].clientX - this.startX;
                this.panY = e.touches[0].clientY - this.startY;
                this.render();
                e.preventDefault();
            } else if (e.touches.length === 2) {
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                const ratio = dist / touchStartDist;
                touchStartDist = dist;
                
                // Zoom center calculation for two fingers:
                // Find midpoint of touches
                const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                
                // Get virtual midpoint coordinates relative to wrapper before zoom
                const rect = this.wrapper.getBoundingClientRect();
                const relativeMidX = midX - rect.left;
                const relativeMidY = midY - rect.top;
                const virtualMidX = (relativeMidX - this.panX) / this.scale;
                const virtualMidY = (relativeMidY - this.panY) / this.scale;
                
                // Adjust scale
                this.scale = Math.max(0.1, Math.min(10.0, this.scale * ratio));
                
                // Re-calculate pan to zoom towards finger midpoint
                this.panX = relativeMidX - virtualMidX * this.scale;
                this.panY = relativeMidY - virtualMidY * this.scale;
                
                this.render();
                e.preventDefault();
            }
        }, { passive: false });

        this.canvas.addEventListener('click', (e) => {
            if (this.isDragging) return;
            this.handleTap(e.clientX, e.clientY);
        });

        window.addEventListener('resize', () => {
            this.fitToScreen();
        });
    }

    setSheet(sheet) {
        this.sheet = sheet;
        this.hoveredPart = null;
        this.hoveredRect = null;
        if (!sheet) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            return;
        }
        this.fitToScreen();
    }

    fitToScreen() {
        if (!this.sheet) return;
        
        const wrapperW = this.wrapper.clientWidth - 40; // padding
        const wrapperH = this.wrapper.clientHeight - 40;
        
        // Scale to fit wrapper width and height
        const scaleX = wrapperW / this.sheet.w;
        const scaleY = wrapperH / this.sheet.h;
        this.scale = Math.min(scaleX, scaleY, 1.5); // maximum scale 1.5x
        
        // Center the sheet
        this.panX = (this.wrapper.clientWidth - this.sheet.w * this.scale) / 2;
        this.panY = (this.wrapper.clientHeight - this.sheet.h * this.scale) / 2;
        
        this.render();
    }

    zoom(direction) {
        const factor = 1.25;
        const centerW = this.wrapper.clientWidth / 2;
        const centerH = this.wrapper.clientHeight / 2;
        const virtualX = (centerW - this.panX) / this.scale;
        const virtualY = (centerH - this.panY) / this.scale;

        if (direction === 'in') {
            this.scale = Math.min(this.scale * factor, 10.0);
        } else if (direction === 'out') {
            this.scale = Math.max(this.scale / factor, 0.1);
        } else {
            this.fitToScreen();
            return;
        }

        this.panX = centerW - virtualX * this.scale;
        this.panY = centerH - virtualY * this.scale;
        this.render();
    }

    handleMouseMove(e) {
        if (!this.sheet) return;
        
        // Don't show tooltip on hover if context menu is active to avoid overlapping clutter
        if (document.getElementById('canvas-context-menu')) {
            if (this.tooltipEl) this.tooltipEl.style.opacity = '0';
            return;
        }
        
        const cRect = this.canvas.getBoundingClientRect();
        const width = this.wrapper.clientWidth;
        const height = this.wrapper.clientHeight;
        
        // Map screen CSS pixels to canvas local CSS coordinates (in case canvas is resized or squeezed by CSS)
        const mouseX = (e.clientX - cRect.left) * (width / (cRect.width || width));
        const mouseY = (e.clientY - cRect.top) * (height / (cRect.height || height));

        const virtualX = (mouseX - this.panX) / this.scale;
        const virtualY = (mouseY - this.panY) / this.scale;
        
        let foundPart = null;
        let foundRect = null;
        
        // Check placed parts
        for (const p of this.sheet.placedParts) {
            if (virtualX >= p.x && virtualX <= p.x + p.w &&
                virtualY >= p.y && virtualY <= p.y + p.h) {
                foundPart = p;
                break;
            }
        }
        
        // Check free rectangles (only if we didn't find a part)
        if (!foundPart) {
            for (const r of this.sheet.freeRects) {
                if (virtualX >= r.x && virtualX <= r.x + r.w &&
                    virtualY >= r.y && virtualY <= r.y + r.h) {
                    foundRect = r;
                    break;
                }
            }
        }
        
        // Trigger redrawing if hover state changes
        if (this.hoveredPart !== foundPart || this.hoveredRect !== foundRect) {
            if (this.hoveredPart !== foundPart && this.onHoverPart) this.onHoverPart(foundPart);
            this.hoveredPart = foundPart;
            this.hoveredRect = foundRect;
            this.render();
        }
        
        // Update tooltip
        this.updateTooltip(foundPart, foundRect, e.clientX, e.clientY);
    }

    handleTap(clientX, clientY) {
        if (!this.sheet) return;
        
        const cRect = this.canvas.getBoundingClientRect();
        const width = this.wrapper.clientWidth;
        const height = this.wrapper.clientHeight;
        
        const mX = (clientX - cRect.left) * (width / (cRect.width || width));
        const mY = (clientY - cRect.top) * (height / (cRect.height || height));
        
        const virtualX = (mX - this.panX) / this.scale;
        const virtualY = (mY - this.panY) / this.scale;
        
        let clickedPart = null;
        let clickedRect = null;
        
        for (const p of this.sheet.placedParts) {
            if (virtualX >= p.x && virtualX <= p.x + p.w &&
                virtualY >= p.y && virtualY <= p.y + p.h) {
                clickedPart = p;
                break;
            }
        }
        
        if (!clickedPart) {
            for (const r of this.sheet.freeRects) {
                if (virtualX >= r.x && virtualX <= r.x + r.w &&
                    virtualY >= r.y && virtualY <= r.y + r.h) {
                    clickedRect = r;
                    break;
                }
            }
        }
        
        // Update hover states
        if (this.hoveredPart !== clickedPart || this.hoveredRect !== clickedRect) {
            this.hoveredPart = clickedPart;
            this.hoveredRect = clickedRect;
            this.render();
        }
        
        // Show context menu if a part is clicked, hide otherwise
        if (clickedPart) {
            this.showContextMenu(clickedPart, clientX, clientY);
            if (this.tooltipEl) {
                this.tooltipEl.style.opacity = '0';
            }
        } else if (clickedRect) {
            this.hideContextMenu();
            this.updateTooltip(null, clickedRect, clientX, clientY);
        } else {
            this.hideContextMenu();
            this.updateTooltip(null, null, clientX, clientY);
        }
    }

    updateTooltip(foundPart, foundRect, clientX, clientY) {
        if (!this.tooltipEl) return;
        
        if (foundPart || foundRect) {
            if (foundPart) {
                const cantoDesc = [];
                const labels = ["Canto Superior (L1)", "Canto Inferior (L2)", "Canto Izquierdo (A1)", "Canto Derecho (A2)"];
                foundPart.cantos.forEach((c, idx) => {
                    if (c === 1) cantoDesc.push(`${labels[idx]}: <strong>Delgado</strong>`);
                    if (c === 2) cantoDesc.push(`${labels[idx]}: <strong>Grueso</strong>`);
                });
                
                this.tooltipEl.innerHTML = `
                    <h4>${escapeHtml(foundPart.name)}</h4>
                    <p>Medida Final: <strong>${foundPart.largoNominal} x ${foundPart.anchoNominal} mm</strong></p>
                    <p>Medida de Corte: <strong>${foundPart.largo} x ${foundPart.ancho} mm</strong></p>
                    <p>Giro permitido (Veta): <strong>${foundPart.veta ? 'No (Fijo)' : 'Sí (Rotable)'}</strong></p>
                    <p>Rotado en corte: <strong>${foundPart.rotated ? 'Sí (90°)' : 'No'}</strong></p>
                    ${cantoDesc.length > 0 ? `<p style="margin-top: 6px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 4px;">${cantoDesc.join('<br>')}</p>` : ''}
                    ${this.grooveTooltip(foundPart)}
                `;
            } else {
                const useful = CutOptimizer.isUsefulLeftover(foundRect);
                this.tooltipEl.innerHTML = `
                    <h4>${useful ? 'Sobrante útil' : 'Merma (retazo muy pequeño)'}</h4>
                    <p>Medidas: <strong>${Math.round(foundRect.w)} x ${Math.round(foundRect.h)} mm</strong></p>
                    <p>Área: <strong>${((foundRect.w * foundRect.h) / 1e6).toFixed(3)} m²</strong></p>
                `;
            }

            this.tooltipEl.style.opacity = '1';
            
            // Posicionar localmente respecto al contenedor wrapper
            const rect = this.wrapper.getBoundingClientRect();
            const tooltipWidth = this.tooltipEl.offsetWidth || 220;
            const tooltipHeight = this.tooltipEl.offsetHeight || 150;
            
            let localX = clientX - rect.left - (tooltipWidth / 2);
            let localY;
            
            // Si el toque/click está en la mitad superior del wrapper, mostrar tooltip abajo para dejar espacio al menú contextual
            if (clientY - rect.top < this.wrapper.clientHeight / 2) {
                localY = clientY - rect.top + 95; // 95px abajo (el menú contextual mide aprox 84px de alto)
            } else {
                localY = clientY - rect.top - tooltipHeight - 15; // 15px arriba
            }
            
            // Ajustar para evitar desborde fuera del wrapper
            localX = Math.max(5, Math.min(localX, this.wrapper.clientWidth - tooltipWidth - 5));
            localY = Math.max(5, Math.min(localY, this.wrapper.clientHeight - tooltipHeight - 5));
            
            this.tooltipEl.style.left = `${localX}px`;
            this.tooltipEl.style.top = `${localY}px`;
        } else {
            this.tooltipEl.style.opacity = '0';
        }
    }

    render() {
        if (!this.sheet) return;
        
        // Dynamically adjust canvas pixels based on container layout
        const pixelRatio = window.devicePixelRatio || 1;
        const width = this.wrapper.clientWidth;
        const height = this.wrapper.clientHeight;
        
        const backingWidth = Math.round(width * pixelRatio);
        const backingHeight = Math.round(height * pixelRatio);
        
        if (this.canvas.width !== backingWidth || this.canvas.height !== backingHeight) {
            this.canvas.width = backingWidth;
            this.canvas.height = backingHeight;
            this.canvas.style.width = `${width}px`;
            this.canvas.style.height = `${height}px`;
            this.ctx.scale(pixelRatio, pixelRatio);
        }
        
        const isPrintMode = window.matchMedia('print').matches;
        this.drawToContext(this.ctx, width, height, this.scale, this.panX, this.panY, isPrintMode);
    }

    drawToContext(ctx, width, height, scale, panX, panY, isPrintMode = false) {
        ctx.clearRect(0, 0, width, height);
        
        ctx.save();
        // Apply panning and zooming scaling
        ctx.translate(panX, panY);
        ctx.scale(scale, scale);
        
        const isLightTheme = document.body.classList.contains('light-theme');

        // 1. Draw sheet background
        ctx.fillStyle = isPrintMode ? '#ffffff' : (isLightTheme ? '#ffffff' : '#0e1726');
        ctx.fillRect(0, 0, this.sheet.w, this.sheet.h);
        
        // Draw sheet border outline
        ctx.strokeStyle = isPrintMode ? '#000000' : (isLightTheme ? '#475569' : '#3b82f6');
        ctx.lineWidth = isPrintMode ? 2 : 1;
        ctx.strokeRect(0, 0, this.sheet.w, this.sheet.h);
        
        // 2. Draw refilado margins (perimeter trim border)
        const refiladoVal = this.sheet.refilado != null ? this.sheet.refilado : 0;
        if (refiladoVal > 0) {
            ctx.strokeStyle = isPrintMode ? '#94a3b8' : (isLightTheme ? 'rgba(239, 68, 68, 0.5)' : 'rgba(239, 68, 68, 0.4)');
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(refiladoVal, refiladoVal, this.sheet.w - 2 * refiladoVal, this.sheet.h - 2 * refiladoVal);
            ctx.setLineDash([]);
        }
        
        const activeCut = (!isPrintMode && this.activeCutIndex >= 0)
            ? this.sheet.cuts[this.activeCutIndex]
            : null;
        const activeRegion = activeCut && activeCut.region ? activeCut.region : null;

        // 3. Draw free rectangles (sobrantes útiles)
        for (const r of this.sheet.freeRects) {
            const isHovered = !isPrintMode && (this.hoveredRect === r);
            const dimmed = !!(activeRegion && !this.rectsOverlap(r, activeRegion));
            ctx.save();
            if (dimmed) ctx.globalAlpha = 0.28;
            ctx.fillStyle = isPrintMode 
                ? '#f8fafc' 
                : (isLightTheme 
                    ? (isHovered ? 'rgba(100, 116, 139, 0.18)' : 'rgba(100, 116, 139, 0.08)')
                    : (isHovered ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.05)'));
            ctx.fillRect(r.x, r.y, r.w, r.h);
            
            ctx.strokeStyle = isPrintMode ? '#000000' : (isLightTheme ? 'rgba(71, 85, 105, 0.3)' : 'rgba(148, 163, 184, 0.25)');
            ctx.lineWidth = isPrintMode ? 1.5 : 1;
            ctx.setLineDash([2, 4]);
            ctx.strokeRect(r.x, r.y, r.w, r.h);
            ctx.setLineDash([]);
            
            // Medidas del sobrante (en pantalla con letra de tamaño fijo en píxeles)
            const screenFont = 11 / scale;
            const showLabel = isPrintMode
                ? (r.w > 60 && r.h > 40)
                : (r.w * scale > 56 && r.h * scale > 16);
            if (showLabel) {
                const fontStack = "'Plus Jakarta Sans', 'Outfit', sans-serif";
                let fontSize = Math.min(Math.round(r.h * 0.15), Math.round(r.w * 0.08));
                fontSize = isPrintMode ? Math.min(Math.max(fontSize, 14), 24) : screenFont;
                const leftoverUse = CutOptimizer.isUsefulLeftover(r) ? 'guardar' : 'leña';
                
                ctx.fillStyle = isPrintMode ? '#000000' : (isLightTheme ? '#475569' : 'rgba(255, 255, 255, 0.85)');
                ctx.font = `bold ${fontSize}px ${fontStack}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`${Math.round(r.w)} × ${Math.round(r.h)}`, r.x + r.w / 2, r.y + r.h / 2 - (isPrintMode ? fontSize * 0.6 : 0), r.w - 8);
                if (isPrintMode) {
                    ctx.font = `${Math.max(fontSize - 2, 12)}px ${fontStack}`;
                    ctx.fillText(leftoverUse, r.x + r.w / 2, r.y + r.h / 2 + fontSize * 0.6, r.w - 8);
                }
            }
            ctx.restore();
        }

        if (activeRegion) {
            ctx.save();
            ctx.strokeStyle = '#eab308';
            ctx.lineWidth = 6;
            ctx.setLineDash([]);
            ctx.strokeRect(activeRegion.x, activeRegion.y, activeRegion.w, activeRegion.h);
            ctx.restore();
        }
        
        // 4. Draw placed parts
        for (const p of this.sheet.placedParts) {
            const isHovered = !isPrintMode && (this.hoveredPart === p);
            const dimmed = !!(activeRegion && !this.rectsOverlap(p, activeRegion));
            ctx.save();
            if (dimmed) ctx.globalAlpha = 0.28;
            
            // Fill
            const partColor = p.color || '#06b6d4';
            ctx.fillStyle = isPrintMode 
                ? '#ffffff' 
                : (isLightTheme 
                    ? (isHovered ? hexToRgba(partColor, 0.75) : hexToRgba(partColor, 0.55))
                    : (isHovered ? hexToRgba(partColor, 0.7) : hexToRgba(partColor, 0.5)));
            ctx.fillRect(p.x, p.y, p.w, p.h);
            
            // Border
            ctx.strokeStyle = isPrintMode ? '#000000' : hexToRgba(partColor, 0.9);
            ctx.lineWidth = isPrintMode ? 2 : ((isHovered && !isPrintMode) ? 2 : 1);
            ctx.strokeRect(p.x, p.y, p.w, p.h);
            
            // Draw tapacantos (edge banding borders)
            this.drawTapacantos(ctx, p, isPrintMode);
            
            // Draw grooves (surcos)
            this.drawGrooves(ctx, p, isPrintMode);
            
            // Pieza de la fila resaltada en la tabla
            if (!isPrintMode && this.highlightRowId && p.rowId === this.highlightRowId) {
                ctx.save();
                ctx.globalAlpha = 1;
                ctx.strokeStyle = '#facc15';
                ctx.lineWidth = Math.max(4, 3 / scale);
                ctx.strokeRect(p.x, p.y, p.w, p.h);
                ctx.restore();
            }

            // Draw part label (Name & Dimensions)
            this.drawPartLabels(ctx, p, isPrintMode, isHovered, scale);
            if (p.veta) this.drawGrainArrow(ctx, p, isPrintMode);
            ctx.restore();
        }
        
        // 5. Draw cut lines
        this.sheet.cuts.forEach((cut, idx) => {
            const isActive = !isPrintMode && (idx === this.activeCutIndex);
            const isDone = !isPrintMode && this.activeCutIndex >= 0 && idx < this.activeCutIndex;
            const isFuture = !isPrintMode && this.activeCutIndex >= 0 && idx > this.activeCutIndex;
            ctx.save();
            if (isFuture) ctx.globalAlpha = 0.15;
            else if (isDone) ctx.globalAlpha = 0.35;
            ctx.beginPath();
            ctx.moveTo(cut.x1, cut.y1);
            ctx.lineTo(cut.x2, cut.y2);
            
            if (isActive) {
                ctx.strokeStyle = '#eab308';
                ctx.lineWidth = 8;
                ctx.setLineDash([]);
            } else if (isPrintMode) {
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 2.5;
                ctx.setLineDash([10, 5]);
            } else {
                ctx.strokeStyle = isLightTheme ? 'rgba(239, 68, 68, 0.7)' : 'rgba(239, 68, 68, 0.6)';
                ctx.lineWidth = 1;
                ctx.setLineDash([6, 3]);
            }
            ctx.stroke();

            // En el plano impreso las pasadas de refilado van sin etiqueta (están en la lista de pasos)
            if ((isPrintMode && cut.kind !== 'refilado') || isActive) {
                this.drawFenceLabel(ctx, cut, isPrintMode, isActive, scale);
            }
            ctx.restore();
        });
        
        ctx.restore();
    }

    rectsOverlap(a, b) {
        return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
    }

    drawFenceLabel(ctx, cut, isPrintMode, isActive, scale = 1) {
        const mx = (cut.x1 + cut.x2) / 2;
        const my = (cut.y1 + cut.y2) / 2;
        const fence = Math.round((cut.fenceMm || 0) * 10) / 10;
        const text = cut.kind === 'refilado'
            ? (cut.fenceMm ? `refilado · tope ${fence} mm` : 'refilado')
            : `tope ${fence} mm`;
        // En pantalla: tamaños en píxeles fijos (u = 1 px expresado en mm del plano)
        const u = isPrintMode ? 1 : 1 / scale;
        const fontSize = isPrintMode ? 18 : 13 * u;
        ctx.save();
        ctx.font = `bold ${fontSize}px 'Plus Jakarta Sans', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const pad = (isPrintMode ? 8 : 6) * u;
        const boxH = isPrintMode ? 24 : 20 * u;
        const tw = ctx.measureText(text).width;
        const isH = Math.abs(cut.y2 - cut.y1) < 1;
        const ox = isH ? 0 : (isPrintMode ? 28 : tw / 2 + 12 * u);
        const oy = isH ? (isPrintMode ? -22 : -16 * u) : 0;
        ctx.fillStyle = isActive ? '#eab308' : '#000000';
        ctx.fillRect(mx + ox - tw / 2 - pad, my + oy - boxH / 2, tw + pad * 2, boxH);
        ctx.fillStyle = isActive ? '#0f172a' : '#ffffff';
        ctx.fillText(text, mx + ox, my + oy);
        ctx.restore();
    }

    drawGrainArrow(ctx, p, isPrintMode) {
        const alongX = !p.rotated;
        const cx = p.x + p.w / 2;
        const cy = p.y + p.h / 2;
        const len = alongX ? Math.min(p.w * 0.45, 80) : Math.min(p.h * 0.45, 80);
        ctx.save();
        ctx.strokeStyle = isPrintMode ? '#000000' : '#fbbf24';
        ctx.fillStyle = ctx.strokeStyle;
        ctx.lineWidth = isPrintMode ? 2.5 : 2;
        ctx.beginPath();
        if (alongX) {
            ctx.moveTo(cx - len / 2, cy - Math.min(p.h * 0.28, 28));
            ctx.lineTo(cx + len / 2, cy - Math.min(p.h * 0.28, 28));
        } else {
            ctx.moveTo(cx - Math.min(p.w * 0.28, 28), cy + len / 2);
            ctx.lineTo(cx - Math.min(p.w * 0.28, 28), cy - len / 2);
        }
        ctx.stroke();
        ctx.restore();
    }

    // Helper to draw edge banding on canvas
    drawTapacantos(ctx, p, isPrintMode) {
        // Tapacantos array order: [L1 (Top), L2 (Bottom), A1 (Left), A2 (Right)] if not rotated.
        // We resolve mapping:
        // Left edge: A1 if not rotated, L1 if rotated.
        // Right edge: A2 if not rotated, L2 if rotated.
        // Top edge: L1 if not rotated, A1 if rotated.
        // Bottom edge: L2 if not rotated, A2 if rotated.
        
        const cLeft = p.rotated ? p.cantos[0] : p.cantos[2];
        const cRight = p.rotated ? p.cantos[1] : p.cantos[3];
        const cTop = p.rotated ? p.cantos[2] : p.cantos[0];
        const cBottom = p.rotated ? p.cantos[3] : p.cantos[1];
        const lLeft = p.rotated ? 'L1' : 'A1';
        const lRight = p.rotated ? 'L2' : 'A2';
        const lTop = p.rotated ? 'A1' : 'L1';
        const lBottom = p.rotated ? 'A2' : 'L2';
        
        const drawEdge = (x1, y1, x2, y2, type, label) => {
            if (type === 0) return;
            
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            
            if (type === 1) { // Delgado
                ctx.strokeStyle = isPrintMode ? '#000000' : '#06b6d4';
                ctx.lineWidth = isPrintMode ? 4 : 3;
            } else if (type === 2) { // Grueso
                ctx.strokeStyle = isPrintMode ? '#000000' : '#f97316';
                ctx.lineWidth = isPrintMode ? 7 : 5;
            }
            
            ctx.stroke();

            if (isPrintMode && label) {
                const mx = (x1 + x2) / 2;
                const my = (y1 + y2) / 2;
                ctx.font = "bold 14px 'Plus Jakarta Sans', sans-serif";
                ctx.fillStyle = '#000000';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const isH = Math.abs(y2 - y1) < 1;
                ctx.fillText(label, mx + (isH ? 0 : 10), my + (isH ? 12 : 0));
            }
            ctx.restore();
        };
        
        // Top Edge (y = p.y, from x = p.x to p.x + p.w)
        drawEdge(p.x, p.y, p.x + p.w, p.y, cTop, lTop);
        // Bottom Edge (y = p.y + p.h, from x = p.x to p.x + p.w)
        drawEdge(p.x, p.y + p.h, p.x + p.w, p.y + p.h, cBottom, lBottom);
        // Left Edge (x = p.x, from y = p.y to p.y + p.h)
        drawEdge(p.x, p.y, p.x, p.y + p.h, cLeft, lLeft);
        // Right Edge (x = p.x + p.w, from y = p.y to p.y + p.h)
        drawEdge(p.x + p.w, p.y, p.x + p.w, p.y + p.h, cRight, lRight);
    }

    // Nombre y medidas dentro de cada pieza. En pantalla la letra mide entre 10 y 16 px reales;
    // si no entra, se muestra solo el nombre, solo las medidas o el número de pieza.
    drawPartLabels(ctx, p, isPrintMode, isHovered, scale = 1) {
        const fontStack = "'Plus Jakarta Sans', 'Outfit', sans-serif";
        if (isPrintMode) {
            this.drawShopPartLabel(ctx, p, fontStack);
            return;
        }

        const isLightTheme = document.body.classList.contains('light-theme');
        const nameColor = isLightTheme ? '#0f172a' : '#ffffff';
        const dimColor = isLightTheme ? '#0f766e' : '#a5f3fc';
        const vertical = p.h > p.w * 1.3;
        const along = vertical ? p.h : p.w;   // dirección en la que corre el texto
        const across = vertical ? p.w : p.h;
        const u = 1 / scale;                  // 1 px de pantalla en mm del plano
        const maxW = along - 8 * u;
        if (maxW <= 0 || across * scale < 9) return;

        const px = Math.max(10, Math.min(16, across * scale * 0.3));
        const fs = px * u;
        const name = p.name || '';
        const dims = `${p.largoNominal} × ${p.anchoNominal}`;
        const num = p.originalIndex !== undefined ? `#${p.originalIndex + 1}${p.rotated ? ' ↻' : ''}` : '';
        const width = (text, weight, size = fs) => {
            ctx.font = `${weight} ${size}px ${fontStack}`;
            return ctx.measureText(text).width;
        };
        const nameWeight = isHovered ? '700' : '600';

        ctx.save();
        ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
        if (vertical) ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Tamaño (px de pantalla, hasta maxPx) con el que el texto entra a lo ancho
        const fitPx = (text, weight, maxPx = px) =>
            Math.min(maxPx, maxPx * maxW / Math.max(1, width(text, weight, maxPx * u)));
        const rowsPx = across * scale; // espacio disponible a lo alto, en px
        const drawLines = (lines, sizePx) => {
            const size = sizePx * u;
            const step = size * 1.15;
            let y = -step * (lines.length - 1) / 2;
            for (const line of lines) {
                ctx.font = `${line.weight} ${size}px ${fontStack}`;
                ctx.fillStyle = line.color;
                ctx.fillText(line.text, 0, y);
                y += step;
            }
        };
        const nameLine = text => ({ text, weight: nameWeight, color: nameColor });
        const dimsLine = { text: dims, weight: '500', color: dimColor };

        let drawn = false;
        // 1) Nombre en una línea (achicado hasta 10 px), con medidas debajo o al lado si caben
        const namePx = name ? fitPx(name, nameWeight) : 0;
        if (namePx >= 10) {
            const combined = `${name} · ${dims}`;
            if (rowsPx >= namePx * 2.6 && fitPx(dims, '500', namePx) >= namePx - 0.01) {
                drawLines([nameLine(name), dimsLine], namePx);
            } else if (fitPx(combined, nameWeight, namePx) >= namePx - 0.01) {
                drawLines([nameLine(combined)], namePx);
            } else {
                drawLines([nameLine(name)], namePx);
            }
            drawn = true;
        }
        // 2) Nombre partido en dos líneas (piezas angostas con nombres largos)
        if (!drawn && name.includes(' ')) {
            const words = name.split(' ');
            let best = null;
            for (let i = 1; i < words.length; i++) {
                const l1 = words.slice(0, i).join(' ');
                const l2 = words.slice(i).join(' ');
                const size = Math.min(fitPx(l1, nameWeight), fitPx(l2, nameWeight));
                if (!best || size > best.size) best = { l1, l2, size };
            }
            if (best && best.size >= 10 && rowsPx >= best.size * 2.4) {
                const lines = [nameLine(best.l1), nameLine(best.l2)];
                if (rowsPx >= best.size * 3.7 && fitPx(dims, '500', best.size) >= best.size - 0.01) lines.push(dimsLine);
                drawLines(lines, best.size);
                drawn = true;
            }
        }
        // 3) Solo medidas
        if (!drawn) {
            const dimsPx = fitPx(dims, '500');
            if (dimsPx >= 10) {
                drawLines([dimsLine], dimsPx);
                drawn = true;
            }
        }
        // 4) Último recurso: número de pieza (mínimo 8 px)
        if (!drawn && num) {
            drawLines([{ text: num, weight: '700', color: nameColor }], Math.max(8, fitPx(num, '700')));
        }
        ctx.restore();
    }

    drawShopPartLabel(ctx, p, fontStack) {
        const partNum = p.originalIndex !== undefined ? String(p.originalIndex + 1) : '';
        const cutText = `${Math.round(p.w * 10) / 10}×${Math.round(p.h * 10) / 10}`;
        const nomText = `${p.largoNominal}×${p.anchoNominal}`;
        const cx = p.x + p.w / 2;
        const cy = p.y + p.h / 2;
        const maxW = Math.max(8, p.w - 8);
        ctx.save();
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const numSize = Math.min(Math.max(18, Math.min(p.w, p.h) * 0.28), 42);
        ctx.font = `bold ${numSize}px ${fontStack}`;
        if (partNum) ctx.fillText(`#${partNum}`, cx, cy - numSize * 0.55, maxW);
        ctx.font = `bold ${Math.max(14, Math.min(numSize * 0.45, 20))}px ${fontStack}`;
        ctx.fillText(cutText, cx, cy + numSize * 0.15, maxW);
        ctx.font = `${Math.max(11, Math.min(numSize * 0.32, 14))}px ${fontStack}`;
        ctx.fillText(`nom. ${nomText}`, cx, cy + numSize * 0.7, maxW);
        ctx.restore();
    }

    // type 'image/jpeg' genera archivos mucho más livianos (útil para el PDF)
    getHighResDataURL(targetWidth = 3000, type = 'image/png', quality) {
        if (!this.sheet) return null;
        
        const aspect = this.sheet.h / this.sheet.w;
        const targetHeight = Math.round(targetWidth * aspect);
        
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = targetWidth;
        exportCanvas.height = targetHeight;
        const eCtx = exportCanvas.getContext('2d');
        
        const scale = targetWidth / this.sheet.w;
        
        // Render in high resolution with white background (print mode = true)
        this.drawToContext(eCtx, targetWidth, targetHeight, scale, 0, 0, true);
        
        return exportCanvas.toDataURL(type, quality);
    }

    // Imagen pequeña de cualquier plancha sin cambiar la vista actual
    renderThumbnail(sheet, width = 220) {
        const prev = this.sheet;
        this.sheet = sheet;
        const url = this.getHighResDataURL(width, 'image/jpeg', 0.8);
        this.sheet = prev;
        return url;
    }

    downloadImage() {
        if (!this.sheet) return;
        
        const url = this.getHighResDataURL(3000);
        if (!url) return;
        
        const filename = `plano_de_corte_plancha_${this.sheet.id}.png`;
        if (isNativeApp) {
            fetch(url).then(r => r.blob()).then(blob => shareNativeFile(filename, blob))
                .catch(err => console.error('No se pudo guardar la imagen:', err));
            return;
        }
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    // Dibujo de Surcos/Ranuras
    drawGrooves(ctx, p, isPrintMode) {
        if (!p.grooves) return;

        // El surco empieza a "offset" mm del borde y tiene "width" mm de ancho (el canvas está en mm)
        const { offset, width } = this.grooveSpec;
        const grooveWidth = Math.max(width, 1);
        const grooveOffset = offset + grooveWidth / 2;

        const gLeft = p.rotated ? p.grooves[0] : p.grooves[2];
        const gRight = p.rotated ? p.grooves[1] : p.grooves[3];
        const gTop = p.rotated ? p.grooves[2] : p.grooves[0];
        const gBottom = p.rotated ? p.grooves[3] : p.grooves[1];

        ctx.save();
        ctx.strokeStyle = isPrintMode ? 'rgba(120, 53, 15, 0.7)' : 'rgba(217, 119, 6, 0.8)'; // marrón / oro
        ctx.lineWidth = grooveWidth;
        ctx.setLineDash([]);
        
        if (gTop) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y + grooveOffset);
            ctx.lineTo(p.x + p.w, p.y + grooveOffset);
            ctx.stroke();
        }
        if (gBottom) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y + p.h - grooveOffset);
            ctx.lineTo(p.x + p.w, p.y + p.h - grooveOffset);
            ctx.stroke();
        }
        if (gLeft) {
            ctx.beginPath();
            ctx.moveTo(p.x + grooveOffset, p.y);
            ctx.lineTo(p.x + grooveOffset, p.y + p.h);
            ctx.stroke();
        }
        if (gRight) {
            ctx.beginPath();
            ctx.moveTo(p.x + p.w - grooveOffset, p.y);
            ctx.lineTo(p.x + p.w - grooveOffset, p.y + p.h);
            ctx.stroke();
        }
        ctx.restore();
    }

    grooveTooltip(part) {
        const labels = ['L1', 'L2', 'A1', 'A2'];
        const edges = (part.grooves || []).map((g, i) => (g ? labels[i] : null)).filter(Boolean);
        if (!edges.length) return '';
        const { offset, width, depth } = this.grooveSpec;
        return `<p>Surcos: <strong>${edges.join(', ')}</strong> (a ${offset} mm, ${width} × ${depth} mm)</p>`;
    }

    // Gestión del Menú Contextual flotante en Canvas
    showContextMenu(part, clientX, clientY) {
        this.hideContextMenu();
        
        const cantoDesc = [];
        const labels = ["Canto Superior (L1)", "Canto Inferior (L2)", "Canto Izquierdo (A1)", "Canto Derecho (A2)"];
        part.cantos.forEach((c, idx) => {
            if (c === 1) cantoDesc.push(`${labels[idx]}: <strong>Delgado</strong>`);
            if (c === 2) cantoDesc.push(`${labels[idx]}: <strong>Grueso</strong>`);
        });

        const menu = document.createElement('div');
        menu.id = 'canvas-context-menu';
        menu.className = 'canvas-context-menu';
        
        const rect = this.wrapper.getBoundingClientRect();
        
        // Clamp and position
        const menuWidth = 240;
        const menuHeight = 180;
        
        let localX = clientX - rect.left - (menuWidth / 2);
        let localY;
        
        // Position below or above clientY depending on coordinates inside wrapper
        if (clientY - rect.top < this.wrapper.clientHeight / 2) {
            localY = clientY - rect.top + 20; // 20px below selection point
        } else {
            localY = clientY - rect.top - menuHeight - 20; // 20px above selection point
        }
        
        // Clamp within wrapper bounds
        localX = Math.max(10, Math.min(localX, this.wrapper.clientWidth - menuWidth - 10));
        localY = Math.max(10, Math.min(localY, this.wrapper.clientHeight - menuHeight - 10));
        
        menu.style.left = `${localX}px`;
        menu.style.top = `${localY}px`;
        
        menu.innerHTML = `
            <div class="canvas-context-menu-info">
                <h4>${escapeHtml(part.name)}</h4>
                <p>Medida Final: <strong>${part.largoNominal} x ${part.anchoNominal} mm</strong></p>
                <p>Medida de Corte: <strong>${part.largo} x ${part.ancho} mm</strong></p>
                <p>Veta (Giro): <strong>${part.veta ? 'No (Fijo)' : 'Sí (Rotable)'}</strong></p>
                <p>Rotado: <strong>${part.rotated ? 'Sí (90°)' : 'No'}</strong></p>
                ${cantoDesc.length > 0 ? `<div class="cantos-info">${cantoDesc.join('<br>')}</div>` : ''}
            </div>
            <div class="canvas-context-menu-actions">
                <button class="context-menu-item" id="ctx-rotate">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path></svg>
                    Girar 90°
                </button>
                <button class="context-menu-item danger" id="ctx-remove">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    Quitar Pieza
                </button>
            </div>
        `;
        
        if (this.wrapper) {
            this.wrapper.appendChild(menu);
        } else {
            document.body.appendChild(menu);
        }
        
        // Stop all pointer/touch/mouse events from bubbling up to wrapper to prevent drag intervention
        menu.addEventListener('click', (e) => e.stopPropagation());
        menu.addEventListener('mousedown', (e) => e.stopPropagation());
        menu.addEventListener('touchstart', (e) => e.stopPropagation());
        menu.addEventListener('touchmove', (e) => e.stopPropagation());
        menu.addEventListener('touchend', (e) => e.stopPropagation());
        
        // Helper function to bind click/touch event handlers robustly on mobile and desktop
        const bindButtonAction = (btn, action) => {
            if (!btn) return;
            let startX = 0;
            let startY = 0;
            let moveLimit = 10;
            let isTouch = false;

            btn.addEventListener('touchstart', (e) => {
                isTouch = true;
                const touch = e.touches[0];
                startX = touch.clientX;
                startY = touch.clientY;
            }, { passive: true });

            btn.addEventListener('touchend', (e) => {
                const touch = e.changedTouches[0];
                const dx = touch.clientX - startX;
                const dy = touch.clientY - startY;
                const dist = Math.hypot(dx, dy);
                if (dist < moveLimit) {
                    e.preventDefault();
                    e.stopPropagation();
                    action();
                }
            });

            btn.addEventListener('click', (e) => {
                if (isTouch) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                action();
            });
        };

        bindButtonAction(document.getElementById('ctx-rotate'), () => {
            this.rotatePartManually(part);
            this.hideContextMenu();
        });
        
        bindButtonAction(document.getElementById('ctx-remove'), () => {
            this.removePartManually(part);
            this.hideContextMenu();
        });
        
        setTimeout(() => {
            window.addEventListener('click', this.closeMenuBind);
        }, 50);
    }

    hideContextMenu() {
        const menu = document.getElementById('canvas-context-menu');
        if (menu) {
            menu.remove();
        }
        window.removeEventListener('click', this.closeMenuBind);
    }

    // Rotación manual con colisiones AABB
    rotatePartManually(part) {
        if (!this.sheet) return;

        if (part.veta) {
            this.notify("No se puede girar esta pieza: tiene veta y el giro la contradice.");
            return;
        }
        
        const newW = part.h;
        const newH = part.w;
        // Usar los valores con los que se optimizó la plancha, no los inputs actuales
        const refiladoVal = this.sheet.refilado != null ? this.sheet.refilado : 10;
        const kerf = this.sheet.kerf != null ? this.sheet.kerf : 4;
        
        // 1. Validar bordes útil plancha
        const limitX = this.sheet.w - refiladoVal;
        const limitY = this.sheet.h - refiladoVal;
        
        if (part.x + newW > limitX + 0.2 || part.y + newH > limitY + 0.2) {
            this.notify("No se puede girar esta pieza: se sale del área útil de la plancha.");
            return;
        }
        
        // 2. Comprobar intersecciones AABB con otras piezas (incluye kerf de sierra)
        for (const other of this.sheet.placedParts) {
            if (other === part) continue;
            
            const collision = !(
                part.x + newW + kerf <= other.x || 
                other.x + other.w + kerf <= part.x ||
                part.y + newH + kerf <= other.y ||
                other.y + other.h + kerf <= part.y
            );
            
            if (collision) {
                this.notify("No se puede girar esta pieza: choca con otra pieza o no deja espacio para la sierra.");
                return;
            }
        }
        
        // 3. Aplicar rotación; quien escucha regenera cortes, sobrantes y métricas
        part.w = newW;
        part.h = newH;
        part.rotated = !part.rotated;
        this.resetCutHighlight();
        if (this.onEdit) {
            this.onEdit({ type: 'rotate', part });
        } else {
            this.render();
        }
    }

    resetCutHighlight() {
        this.activeCutIndex = -1;
        this.completedCutIndex = -1;
    }

    // Remoción manual: la pieza pasa a "sin colocar"
    removePartManually(part) {
        if (!this.sheet) return;
        this.resetCutHighlight();
        if (this.onEdit) {
            this.onEdit({ type: 'remove', part });
        } else {
            this.sheet.placedParts = this.sheet.placedParts.filter(p => p !== part);
            this.render();
        }
    }
}
