// Renderizador del Mapa de Corte con HTML5 Canvas - MelaminaCut

// Helper to convert HEX color to RGBA
function hexToRgba(hex, alpha) {
    if (!hex) return `rgba(6, 182, 212, ${alpha})`;
    hex = hex.replace('#', '');
    if (hex.length === 3) {
        hex = hex.split('').map(char => char + char).join('');
    }
    const r = parseInt(hex.substring(0, 2), 16) || 6;
    const g = parseInt(hex.substring(2, 4), 16) || 182;
    const b = parseInt(hex.substring(4, 6), 16) || 212;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

class CutMapCanvas {
    constructor(canvasId, containerId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
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
        this.wrapper.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                this.isDragging = true;
                this.startX = e.touches[0].clientX - this.panX;
                this.startY = e.touches[0].clientY - this.panY;
                e.preventDefault();
            } else if (e.touches.length === 2) {
                touchStartDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                e.preventDefault();
            }
        }, { passive: false });

        this.wrapper.addEventListener('touchend', () => {
            this.isDragging = false;
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
            
            const cRect = this.canvas.getBoundingClientRect();
            const mX = (e.clientX - cRect.left) * (this.wrapper.clientWidth / (cRect.width || this.wrapper.clientWidth));
            const mY = (e.clientY - cRect.top) * (this.wrapper.clientHeight / (cRect.height || this.wrapper.clientHeight));
            const virtualX = (mX - this.panX) / this.scale;
            const virtualY = (mY - this.panY) / this.scale;
            
            let clickedPart = null;
            if (this.sheet) {
                for (const p of this.sheet.placedParts) {
                    if (virtualX >= p.x && virtualX <= p.x + p.w &&
                        virtualY >= p.y && virtualY <= p.y + p.h) {
                        clickedPart = p;
                        break;
                    }
                }
            }
            
            if (clickedPart) {
                this.showContextMenu(clickedPart, e.clientX, e.clientY);
            } else {
                this.hideContextMenu();
            }
        });

        window.addEventListener('resize', () => {
            this.fitToScreen();
        });
    }

    setSheet(sheet) {
        this.sheet = sheet;
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
            this.hoveredPart = foundPart;
            this.hoveredRect = foundRect;
            this.render();
        }
        
        // Update tooltip
        if (foundPart || foundRect) {
            if (foundPart) {
                const cantoDesc = [];
                const labels = ["Canto Superior (L1)", "Canto Inferior (L2)", "Canto Izquierdo (A1)", "Canto Derecho (A2)"];
                foundPart.cantos.forEach((c, idx) => {
                    if (c === 1) cantoDesc.push(`${labels[idx]}: <strong>Delgado</strong>`);
                    if (c === 2) cantoDesc.push(`${labels[idx]}: <strong>Grueso</strong>`);
                });
                
                this.tooltipEl.innerHTML = `
                    <h4>${foundPart.name}</h4>
                    <p>Medida Final: <strong>${foundPart.largoNominal} x ${foundPart.anchoNominal} mm</strong></p>
                    <p>Medida de Corte: <strong>${foundPart.largo} x ${foundPart.ancho} mm</strong></p>
                    <p>Giro permitido (Veta): <strong>${foundPart.veta ? 'No (Fijo)' : 'Sí (Rotable)'}</strong></p>
                    <p>Rotado en corte: <strong>${foundPart.rotated ? 'Sí (90°)' : 'No'}</strong></p>
                    ${cantoDesc.length > 0 ? `<p style="margin-top: 6px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 4px;">${cantoDesc.join('<br>')}</p>` : ''}
                `;
            } else {
                this.tooltipEl.innerHTML = `
                    <h4>Sobrante Útil</h4>
                    <p>Medidas: <strong>${Math.round(foundRect.w)} x ${Math.round(foundRect.h)} mm</strong></p>
                    <p>Área: <strong>${Math.round((foundRect.w * foundRect.h) / 100) / 100} cm²</strong></p>
                `;
            }

            this.tooltipEl.style.opacity = '1';
            
            // Posicionar localmente respecto al contenedor wrapper
            const rect = this.wrapper.getBoundingClientRect();
            let localX = e.clientX - rect.left + 15;
            let localY = e.clientY - rect.top + 15;
            
            // Ajustar para evitar desborde fuera del wrapper
            const tooltipWidth = this.tooltipEl.offsetWidth || 220;
            const tooltipHeight = this.tooltipEl.offsetHeight || 150;
            
            if (localX + tooltipWidth > this.wrapper.clientWidth) {
                localX = e.clientX - rect.left - tooltipWidth - 15;
            }
            if (localY + tooltipHeight > this.wrapper.clientHeight) {
                localY = e.clientY - rect.top - tooltipHeight - 15;
            }
            
            localX = Math.max(5, localX);
            localY = Math.max(5, localY);
            
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
        const refiladoVal = (this.sheet.w - (this.sheet.freeRects[0]?.w || this.sheet.w)) / 2; 
        if (refiladoVal > 0) {
            ctx.strokeStyle = isPrintMode ? '#94a3b8' : (isLightTheme ? 'rgba(239, 68, 68, 0.5)' : 'rgba(239, 68, 68, 0.4)');
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(refiladoVal, refiladoVal, this.sheet.w - 2 * refiladoVal, this.sheet.h - 2 * refiladoVal);
            ctx.setLineDash([]);
        }
        
        // 3. Draw free rectangles (sobrantes útiles)
        for (const r of this.sheet.freeRects) {
            const isHovered = !isPrintMode && (this.hoveredRect === r);
            ctx.fillStyle = isPrintMode 
                ? '#f8fafc' 
                : (isLightTheme 
                    ? (isHovered ? 'rgba(100, 116, 139, 0.18)' : 'rgba(100, 116, 139, 0.08)')
                    : (isHovered ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.05)'));
            ctx.fillRect(r.x, r.y, r.w, r.h);
            
            ctx.strokeStyle = isPrintMode ? '#cbd5e1' : (isLightTheme ? 'rgba(71, 85, 105, 0.3)' : 'rgba(148, 163, 184, 0.25)');
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 4]);
            ctx.strokeRect(r.x, r.y, r.w, r.h);
            ctx.setLineDash([]);
            
            // Draw dimension labels for larger free spaces
            if (r.w > 60 && r.h > 40) {
                const labelText = `Sobrante: ${Math.round(r.w)}x${Math.round(r.h)}`;
                const fontStack = "'Plus Jakarta Sans', 'Outfit', sans-serif";
                let fontSize = Math.min(Math.round(r.h * 0.15), Math.round(r.w * 0.08));
                fontSize = Math.min(Math.max(fontSize, 12), 24); // at least 12px, max 24px
                
                ctx.fillStyle = isPrintMode ? '#475569' : (isLightTheme ? '#475569' : 'rgba(255, 255, 255, 0.85)');
                ctx.font = `bold ${fontSize}px ${fontStack}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(labelText, r.x + r.w / 2, r.y + r.h / 2, r.w - 8);
            }
        }
        
        // 4. Draw placed parts
        for (const p of this.sheet.placedParts) {
            const isHovered = !isPrintMode && (this.hoveredPart === p);
            
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
            ctx.lineWidth = (isHovered && !isPrintMode) ? 2 : 1;
            ctx.strokeRect(p.x, p.y, p.w, p.h);
            
            // Draw tapacantos (edge banding borders)
            this.drawTapacantos(ctx, p, isPrintMode);
            
            // Draw grooves (surcos)
            this.drawGrooves(ctx, p, isPrintMode);
            
            // Draw part label (Name & Dimensions)
            this.drawPartLabels(ctx, p, isPrintMode, isHovered);
        }
        
        // 5. Draw cut lines
        this.sheet.cuts.forEach((cut, idx) => {
            const isActive = (idx === this.activeCutIndex);
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(cut.x1, cut.y1);
            ctx.lineTo(cut.x2, cut.y2);
            
            if (isActive) {
                ctx.strokeStyle = '#eab308'; // Amarillo brillante para el corte activo
                ctx.lineWidth = isPrintMode ? 3 : 4;
                ctx.setLineDash([8, 4]);
            } else {
                ctx.strokeStyle = isPrintMode ? '#475569' : (isLightTheme ? 'rgba(239, 68, 68, 0.7)' : 'rgba(239, 68, 68, 0.6)');
                ctx.lineWidth = 1;
                ctx.setLineDash([6, 3]);
            }
            ctx.stroke();
            ctx.restore();
        });
        
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
        
        const drawEdge = (x1, y1, x2, y2, type) => {
            if (type === 0) return;
            
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            
            if (type === 1) { // Delgado
                ctx.strokeStyle = isPrintMode ? '#475569' : '#06b6d4';
                ctx.lineWidth = isPrintMode ? 2 : 3;
            } else if (type === 2) { // Grueso
                ctx.strokeStyle = isPrintMode ? '#000000' : '#f97316';
                ctx.lineWidth = isPrintMode ? 4 : 5;
            }
            
            ctx.stroke();
            ctx.restore();
        };
        
        // Top Edge (y = p.y, from x = p.x to p.x + p.w)
        drawEdge(p.x, p.y, p.x + p.w, p.y, cTop);
        // Bottom Edge (y = p.y + p.h, from x = p.x to p.x + p.w)
        drawEdge(p.x, p.y + p.h, p.x + p.w, p.y + p.h, cBottom);
        // Left Edge (x = p.x, from y = p.y to p.y + p.h)
        drawEdge(p.x, p.y, p.x, p.y + p.h, cLeft);
        // Right Edge (x = p.x + p.w, from y = p.y to p.y + p.h)
        drawEdge(p.x + p.w, p.y, p.x + p.w, p.y + p.h, cRight);
    }

    // Helper to draw labels (Text) inside the pieces
    drawPartLabels(ctx, p, isPrintMode, isHovered) {
        const padding = 6;
        const textMaxWidth = p.w - padding * 2;
        
        const fontStack = "'Plus Jakarta Sans', 'Outfit', sans-serif";
        ctx.textBaseline = 'middle';
        
        const isLightTheme = document.body.classList.contains('light-theme');
        const nameText = p.name;
        const dimText = `${p.largoNominal} x ${p.anchoNominal}`;

        // Check if piece is vertical
        const isVertical = p.h > p.w * 1.3;
        
        if (isVertical) {
            ctx.save();
            ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
            ctx.rotate(-Math.PI / 2); // Rotate 270 degrees (vertical running from bottom to top)
            
            const vertTextMaxWidth = p.h - padding * 2;
            if (vertTextMaxWidth <= 0) {
                ctx.restore();
                return;
            }
            
            // Check if we can fit 2 stacked lines in rotated context!
            if (p.w >= 60 && p.h >= 130) {
                let fontSize = Math.min(Math.round(p.w * 0.15), Math.round(p.h * 0.15));
                fontSize = Math.min(Math.max(fontSize, 12), 32);
                
                ctx.textAlign = 'center';
                
                // Name
                ctx.font = `${isHovered ? 'bold' : ''} ${fontSize}px ${fontStack}`;
                ctx.fillStyle = (isPrintMode || isLightTheme) ? '#0f172a' : '#ffffff';
                ctx.fillText(nameText, 0, -fontSize * 0.55, vertTextMaxWidth);
                
                // Dimensions
                ctx.font = `600 ${Math.max(fontSize - 1, 11)}px ${fontStack}`;
                ctx.fillStyle = (isPrintMode || isLightTheme) ? '#0f766e' : '#a5f3fc';
                ctx.fillText(dimText, 0, fontSize * 0.55, vertTextMaxWidth);
            } 
            // Otherwise draw single line vertically
            else {
                const separator = " - ";
                let fontSize = Math.min(Math.round(p.w * 0.32), 26);
                fontSize = Math.max(fontSize, 10);
                
                ctx.font = `${isHovered ? 'bold' : ''} ${fontSize}px ${fontStack}`;
                let nameWidth = ctx.measureText(nameText).width;
                let sepWidth = ctx.measureText(separator).width;
                ctx.font = `600 ${fontSize}px ${fontStack}`;
                let dimWidth = ctx.measureText(dimText).width;
                let totalWidth = nameWidth + sepWidth + dimWidth;
                
                if (totalWidth > vertTextMaxWidth) {
                    fontSize = Math.floor(fontSize * (vertTextMaxWidth / totalWidth));
                    ctx.font = `${isHovered ? 'bold' : ''} ${fontSize}px ${fontStack}`;
                    nameWidth = ctx.measureText(nameText).width;
                    sepWidth = ctx.measureText(separator).width;
                    ctx.font = `600 ${fontSize}px ${fontStack}`;
                    dimWidth = ctx.measureText(dimText).width;
                    totalWidth = nameWidth + sepWidth + dimWidth;
                }
                
                if (fontSize < 9 || p.h < 50) {
                    // Draw fallback index vertically
                    const indexFontSize = Math.min(Math.max(Math.round(p.w * 0.45), 8), 14);
                    ctx.font = `bold ${indexFontSize}px ${fontStack}`;
                    ctx.fillStyle = (isPrintMode || isLightTheme) ? '#0f172a' : '#ffffff';
                    ctx.textAlign = 'center';
                    ctx.fillText(`${p.originalIndex !== undefined ? p.originalIndex + 1 : ''}${p.rotated ? 'R' : ''}`, 0, 0, vertTextMaxWidth);
                } else {
                    let startX = -totalWidth / 2;
                    
                    // Name
                    ctx.font = `${isHovered ? 'bold' : ''} ${fontSize}px ${fontStack}`;
                    ctx.fillStyle = (isPrintMode || isLightTheme) ? '#0f172a' : '#ffffff';
                    ctx.textAlign = 'left';
                    ctx.fillText(nameText, startX, 0);
                    
                    // Separator
                    ctx.fillStyle = isPrintMode ? '#64748b' : '#94a3b8';
                    ctx.fillText(separator, startX + nameWidth, 0);
                    
                    // Dimensions
                    ctx.font = `600 ${fontSize}px ${fontStack}`;
                    ctx.fillStyle = (isPrintMode || isLightTheme) ? '#0f766e' : '#a5f3fc';
                    ctx.fillText(dimText, startX + nameWidth + sepWidth, 0);
                }
            }
            
            ctx.restore();
            return;
        }

        if (textMaxWidth <= 0) return;
        
        // 1. Tall and wide pieces: 2 stacked lines (Name and Nominal Dimensions in cyan/teal)
        if (p.h >= 130 && p.w >= 130) {
            let fontSize = Math.min(Math.round(p.h * 0.15), Math.round(p.w * 0.15));
            fontSize = Math.min(Math.max(fontSize, 14), 75);
            
            ctx.textAlign = 'center';
            
            // Draw Name (Line 1)
            ctx.font = `${isHovered ? 'bold' : ''} ${fontSize}px ${fontStack}`;
            ctx.fillStyle = (isPrintMode || isLightTheme) ? '#0f172a' : '#ffffff';
            ctx.fillText(nameText, p.x + p.w / 2, p.y + p.h / 2 - fontSize * 0.55, textMaxWidth);
            
            // Draw Nominal Dimensions (Line 2)
            ctx.font = `600 ${Math.max(fontSize - 1, 11)}px ${fontStack}`;
            ctx.fillStyle = (isPrintMode || isLightTheme) ? '#0f766e' : '#a5f3fc'; // dark green/teal in print/light, cyan in dark mode
            ctx.fillText(dimText, p.x + p.w / 2, p.y + p.h / 2 + fontSize * 0.55, textMaxWidth);
        } 
        // 2. Short/Narrow pieces: Single line with name and dimensions side by side
        else {
            const separator = " - ";
            
            // Calculate initial font size based on height
            let fontSize = Math.min(Math.round(p.h * 0.32), 26);
            fontSize = Math.max(fontSize, 12);
            
            ctx.font = `${isHovered ? 'bold' : ''} ${fontSize}px ${fontStack}`;
            let nameWidth = ctx.measureText(nameText).width;
            let sepWidth = ctx.measureText(separator).width;
            
            ctx.font = `600 ${fontSize}px ${fontStack}`;
            let dimWidth = ctx.measureText(dimText).width;
            
            let totalWidth = nameWidth + sepWidth + dimWidth;
            
            // Check if it fits horizontally. If not, scale down fontSize
            if (totalWidth > textMaxWidth) {
                fontSize = Math.floor(fontSize * (textMaxWidth / totalWidth));
                
                // Re-measure with scaled fontSize
                ctx.font = `${isHovered ? 'bold' : ''} ${fontSize}px ${fontStack}`;
                nameWidth = ctx.measureText(nameText).width;
                sepWidth = ctx.measureText(separator).width;
                
                ctx.font = `600 ${fontSize}px ${fontStack}`;
                dimWidth = ctx.measureText(dimText).width;
                
                totalWidth = nameWidth + sepWidth + dimWidth;
            }
            
            // If even at minimum font size it doesn't fit or piece is extremely tiny/narrow, fall back to index number
            if (fontSize < 10 || p.h < 15 || p.w < 50) {
                const indexFontSize = Math.min(Math.max(Math.round(p.h * 0.45), 8), 14);
                ctx.font = `bold ${indexFontSize}px ${fontStack}`;
                ctx.fillStyle = (isPrintMode || isLightTheme) ? '#0f172a' : '#ffffff';
                ctx.textAlign = 'center';
                ctx.fillText(`${p.originalIndex !== undefined ? p.originalIndex + 1 : ''}${p.rotated ? 'R' : ''}`, p.x + p.w / 2, p.y + p.h / 2, textMaxWidth);
            } else {
                // Draw side-by-side text centered horizontally and vertically
                let startX = p.x + p.w / 2 - totalWidth / 2;
                
                // Name
                ctx.font = `${isHovered ? 'bold' : ''} ${fontSize}px ${fontStack}`;
                ctx.fillStyle = (isPrintMode || isLightTheme) ? '#0f172a' : '#ffffff';
                ctx.textAlign = 'left';
                ctx.fillText(nameText, startX, p.y + p.h / 2);
                
                // Separator
                ctx.fillStyle = isPrintMode ? '#64748b' : '#94a3b8';
                ctx.fillText(separator, startX + nameWidth, p.y + p.h / 2);
                
                // Dimensions (cyan / teal)
                ctx.font = `600 ${fontSize}px ${fontStack}`;
                ctx.fillStyle = (isPrintMode || isLightTheme) ? '#0f766e' : '#a5f3fc';
                ctx.fillText(dimText, startX + nameWidth + sepWidth, p.y + p.h / 2);
            }
        }
    }

    getHighResDataURL(targetWidth = 3000) {
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
        
        return exportCanvas.toDataURL('image/png');
    }

    downloadImage() {
        if (!this.sheet) return;
        
        const url = this.getHighResDataURL(3000);
        if (!url) return;
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `plano_de_corte_plancha_${this.sheet.id}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    // Dibujo de Surcos/Ranuras
    drawGrooves(ctx, p, isPrintMode) {
        if (!p.grooves) return;
        
        const grooveOffset = parseFloat(document.getElementById('input-groove-offset')?.value) || 15;
        
        const gLeft = p.rotated ? p.grooves[0] : p.grooves[2];
        const gRight = p.rotated ? p.grooves[1] : p.grooves[3];
        const gTop = p.rotated ? p.grooves[2] : p.grooves[0];
        const gBottom = p.rotated ? p.grooves[3] : p.grooves[1];
        
        ctx.save();
        ctx.strokeStyle = isPrintMode ? '#78350f' : '#d97706'; // marrón / oro
        ctx.lineWidth = isPrintMode ? 2 : 2.5;
        ctx.setLineDash([2, 3]);
        
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

    // Gestión del Menú Contextual flotante en Canvas
    showContextMenu(part, clientX, clientY) {
        this.hideContextMenu();
        
        const menu = document.createElement('div');
        menu.id = 'canvas-context-menu';
        menu.className = 'canvas-context-menu';
        
        const rect = this.wrapper.getBoundingClientRect();
        let localX = clientX - rect.left;
        let localY = clientY - rect.top;
        
        // Clamp inside wrapper bounds to prevent clipping by overflow: hidden
        const menuWidth = 140;
        const menuHeight = 84;
        
        if (localX + menuWidth > this.wrapper.clientWidth) {
            localX = this.wrapper.clientWidth - menuWidth - 5;
        }
        if (localY + menuHeight > this.wrapper.clientHeight) {
            localY = this.wrapper.clientHeight - menuHeight - 5;
        }
        
        localX = Math.max(5, localX);
        localY = Math.max(5, localY);
        
        menu.style.left = `${localX}px`;
        menu.style.top = `${localY}px`;
        
        menu.innerHTML = `
            <button class="context-menu-item" id="ctx-rotate">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path></svg>
                Girar 90°
            </button>
            <button class="context-menu-item danger" id="ctx-remove">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                Quitar Pieza
            </button>
        `;
        
        if (this.wrapper) {
            this.wrapper.appendChild(menu);
        } else {
            document.body.appendChild(menu);
        }
        
        menu.addEventListener('click', (e) => e.stopPropagation());
        
        document.getElementById('ctx-rotate').addEventListener('click', () => {
            this.rotatePartManually(part);
            this.hideContextMenu();
        });
        
        document.getElementById('ctx-remove').addEventListener('click', () => {
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
        
        const newW = part.h;
        const newH = part.w;
        const refiladoVal = parseFloat(document.getElementById('input-refilado')?.value) || 10;
        
        // 1. Validar bordes útil plancha
        const limitX = this.sheet.w - refiladoVal;
        const limitY = this.sheet.h - refiladoVal;
        
        if (part.x + newW > limitX || part.y + newH > limitY) {
            alert("No se puede rotar esta pieza: supera los límites útiles de la plancha.");
            return;
        }
        
        // 2. Comprobar intersecciones AABB con otras piezas de la plancha
        for (const other of this.sheet.placedParts) {
            if (other === part) continue;
            
            const collision = !(
                part.x + newW <= other.x || 
                other.x + other.w <= part.x ||
                part.y + newH <= other.y ||
                other.y + other.h <= part.y
            );
            
            if (collision) {
                alert("No se puede rotar esta pieza: colisiona con otras piezas colocadas en este tablero.");
                return;
            }
        }
        
        // 3. Aplicar rotación
        part.w = newW;
        part.h = newH;
        part.rotated = !part.rotated;
        
        // Disparar evento personalizado en el ámbito global para actualizar estadísticas
        if (window.onCanvasPartModified) {
            window.onCanvasPartModified();
        } else {
            this.render();
        }
    }

    // Remoción manual
    removePartManually(part) {
        if (!this.sheet) return;
        
        if (window.onCanvasPartRemoved) {
            window.onCanvasPartRemoved(part);
        } else {
            this.sheet.placedParts = this.sheet.placedParts.filter(p => p !== part);
            this.render();
        }
    }
}
