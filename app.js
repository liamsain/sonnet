import { sonnets } from './data.js';

function getRandomSonnet() {
    const validSonnets = sonnets.filter(sonnet => {
        const lines = sonnet.split('\n').filter(line => line.trim() !== '');
        return lines.length >= 14;
    });
    if (validSonnets.length === 0) {
        console.error('No valid sonnets found');
        return null;
    }
    const selectedSonnet = validSonnets[Math.floor(Math.random() * validSonnets.length)];
    return selectedSonnet.split('\n')
        .map(line => line.trim())
        .filter(line => line !== '')
        .slice(0, 14);
}

// Game state
let currentSonnet = null;
let slots = Array(14).fill(null);
let draggedLine = null;
let draggedSlotIndex = null;
let isDragging = false;
let dragOffset = { x: 0, y: 0 };
let dragClickOffset = { x: 0, y: 0 };
let hasDragged = false;
let dragStartPos = { x: 0, y: 0 };
let hoveredSlotIndex = -1;
let shakingSlots = new Set();
let shakeAnimationFrame = null;
let shakeStartTime = null;
let incorrectSlots = new Set();
let checkedSlots = new Set();
let checkOrderCount = 0;
let hasCheckedAndPassed = false;

// Mobile detection
function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           (window.innerWidth <= 768);
}

// Canvas setup
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const SLOT_MARGIN = 5;
const SLOTS_PER_ROW = 1;
const SLOT_START_X = 28;
const BUTTON_MARGIN = 10;
const DESKTOP_CANVAS_WIDTH = 540;
const DESKTOP_CANVAS_HEIGHT = 775;

function getSlotStartY() { return isMobile() ? 100 : 90; }
function getButtonY() { return isMobile() ? 15 : 20; }
function getButtonWidth() { return isMobile() ? 110 : 130; }
function getButtonHeight() { return isMobile() ? 40 : 35; }

function getSlotWidth() {
    return isMobile() ? canvas.width - 44 : 480;
}

function getSlotHeight() {
    return isMobile() ? 45 : 40;
}

function calculateCanvasHeight() {
    if (isMobile()) {
        return getSlotStartY() + 14 * (getSlotHeight() + SLOT_MARGIN) + 30;
    }
    return DESKTOP_CANVAS_HEIGHT;
}

function getButtons() {
    const by = getButtonY(), bw = getButtonWidth(), bh = getButtonHeight();
    return {
        checkOrder: { x: SLOT_START_X, y: by, text: 'Check Order', width: bw, height: bh },
        newSonnet: { x: SLOT_START_X + bw + BUTTON_MARGIN, y: by, text: 'New Sonnet', width: bw, height: bh }
    };
}

function setCanvasSize() {
    if (isMobile()) {
        canvas.width = Math.min(window.innerWidth - 40, 500);
        canvas.height = calculateCanvasHeight();
    } else {
        canvas.width = DESKTOP_CANVAS_WIDTH;
        canvas.height = DESKTOP_CANVAS_HEIGHT;
    }
}
setCanvasSize();

function hasAtLeastOneLinePlaced() {
    return slots.some(s => s);
}

function isButtonDisabled(key) {
    if (key === 'checkOrder') return !hasAtLeastOneLinePlaced();
    if (key === 'newSonnet') return !isOrderCorrect() || !hasCheckedAndPassed;
    return false;
}

function isOrderCorrect() {
    if (!currentSonnet?.length) return false;
    for (let i = 0; i < currentSonnet.length; i++) {
        if (slots[i] !== currentSonnet[i]) return false;
    }
    for (let i = currentSonnet.length; i < slots.length; i++) {
        if (slots[i]) return false;
    }
    return true;
}


function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function initGame() {
    currentSonnet = getRandomSonnet();
    if (!currentSonnet) {
        alert('Failed to load sonnets.');
        return;
    }
    const shuffledLines = shuffleArray(currentSonnet);
    slots = Array(14).fill(null);
    const slotIndices = shuffleArray(Array.from({ length: 14 }, (_, i) => i));
    shuffledLines.forEach((line, i) => { slots[slotIndices[i]] = line; });
    incorrectSlots.clear();
    checkedSlots.clear();
    checkOrderCount = 0;
    hasCheckedAndPassed = false;
    render();
}

// Get slot position
function getSlotPosition(index) {
    const row = Math.floor(index / SLOTS_PER_ROW);
    const col = index % SLOTS_PER_ROW;
    return {
        x: SLOT_START_X + col * (getSlotWidth() + SLOT_MARGIN),
        y: getSlotStartY() + row * (getSlotHeight() + SLOT_MARGIN)
    };
}

function clearSlotState(...indices) {
    indices.forEach(i => {
        incorrectSlots.delete(i);
        checkedSlots.delete(i);
    });
}

function getSlotAt(x, y) {
    for (let i = 0; i < slots.length; i++) {
        const pos = getSlotPosition(i);
        if (x >= pos.x && x <= pos.x + getSlotWidth() &&
            y >= pos.y && y <= pos.y + getSlotHeight()) {
            return i;
        }
    }
    return -1;
}

// Check if point is in button
function isPointInButton(x, y, button) {
    return x >= button.x && x <= button.x + button.width &&
           y >= button.y && y <= button.y + button.height;
}

// Draw rounded rectangle
function drawRoundedRect(x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}



function render() {
    ctx.fillStyle = '#faf8f5';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#333';
    ctx.textBaseline = 'top';

    // Slots
    for (let i = 0; i < slots.length; i++) {
        const pos = getSlotPosition(i);
        // Apply shake offset if slot is shaking
        const shakeOffset = shakingSlots.has(i) ? getShakeOffset() : 0;
        const x = pos.x + shakeOffset;
        
        // Determine colors based on slot state
        const isIncorrect = incorrectSlots.has(i);
        const isChecked = checkedSlots.has(i);
        const isHovered = isDragging && hoveredSlotIndex === i;
        const radius = 6; // Corner radius
        
        // If hovered while dragging, use hover colors
        if (isHovered) {
            ctx.strokeStyle = '#64b5f6'; // Slightly brighter blue border
            ctx.fillStyle = '#bbdefb'; // Brighter blue background for hover
        } else if (slots[i]) {
            if (isChecked) {
                // After checking: red if incorrect, green if correct
                ctx.strokeStyle = isIncorrect ? '#ff9999' : '#a5d6a7'; // Lighter red if incorrect, lighter green if correct
                ctx.fillStyle = isIncorrect ? '#ffebee' : '#f0f8f0'; // Light red if incorrect, light green if correct
            } else {
                // Before checking: blue for all filled slots
                ctx.strokeStyle = '#90caf9'; // Light blue border
                ctx.fillStyle = '#e3f2fd'; // Light blue background
            }
        } else {
            ctx.strokeStyle = '#e0e0e0'; // Lighter gray
            ctx.fillStyle = '#fafafa';
        }
        ctx.lineWidth = 1; // Thinner border
        drawRoundedRect(x, pos.y, getSlotWidth(), getSlotHeight(), radius);
        ctx.fill();
        ctx.stroke();
        
        // Line number (fixed position, excluded from shake)
        const lineNumber = i + 1;
        ctx.fillStyle = '#999';
        ctx.font = isMobile() ? '16px Georgia' : '14px Georgia';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${lineNumber}`, pos.x - 6, pos.y + getSlotHeight() / 2);
        ctx.textAlign = 'left';
        
        if (slots[i]) {
            ctx.fillStyle = '#333';
            ctx.font = '16px Georgia';
            ctx.textBaseline = 'top'; // Use top baseline for wrapped text
            const text = slots[i];
            const textX = x + 10; // Small padding from left edge
            const maxWidth = getSlotWidth() - 20; // Account for padding on both sides
            const lineHeight = isMobile() ? 18 : 20;
            const slotPadding = 8; // Vertical padding within slot
            
            // Use word wrapping for mobile, single line with ellipsis for desktop
            if (isMobile()) {
                // Measure text to center it vertically
                const words = text.split(' ');
                let wrappedLines = [];
                let currentLine = '';
                
                for (let i = 0; i < words.length; i++) {
                    const testLine = currentLine + (currentLine ? ' ' : '') + words[i];
                    const metrics = ctx.measureText(testLine);
                    if (metrics.width > maxWidth && currentLine) {
                        wrappedLines.push(currentLine);
                        currentLine = words[i];
                    } else {
                        currentLine = testLine;
                    }
                }
                if (currentLine) {
                    wrappedLines.push(currentLine);
                }
                
                // Center text vertically in slot
                const totalTextHeight = wrappedLines.length * lineHeight;
                const textStartY = pos.y + (getSlotHeight() - totalTextHeight) / 2;
                
                // Draw each line
                wrappedLines.forEach((line, idx) => {
                    ctx.fillText(line, textX, textStartY + idx * lineHeight);
                });
            } else {
                // Desktop: single line with ellipsis if needed
                ctx.textBaseline = 'middle';
                const metrics = ctx.measureText(text);
                if (metrics.width > maxWidth) {
                    // Truncate with ellipsis
                    let truncated = text;
                    while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
                        truncated = truncated.slice(0, -1);
                    }
                    ctx.fillText(truncated + '...', textX, pos.y + getSlotHeight() / 2);
                } else {
                    ctx.fillText(text, textX, pos.y + getSlotHeight() / 2);
                }
            }
        }
        
        ctx.textBaseline = 'top';
    }
    
    if (isDragging) {
        ctx.strokeStyle = '#2196F3'; // More pronounced, brighter blue
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 4]); // Slightly longer dashes for more visibility
        for (let i = 0; i < slots.length; i++) {
            const pos = getSlotPosition(i);
            // Apply shake offset if slot is shaking
            const shakeOffset = shakingSlots.has(i) ? getShakeOffset() : 0;
            const x = pos.x + shakeOffset;
            drawRoundedRect(x, pos.y, getSlotWidth(), getSlotHeight(), 6);
            ctx.stroke();
        }
        ctx.setLineDash([]);
    }

    // Buttons
    ctx.font = isMobile() ? '16px Georgia' : '15px Georgia';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    for (const [key, button] of Object.entries(getButtons())) {
        const isDisabled = isButtonDisabled(key);
        const radius = 6;

        if (!isDisabled) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
            drawRoundedRect(button.x + 1, button.y + 2, button.width, button.height, radius);
            ctx.fill();
        }
        if (isDisabled) {
            ctx.fillStyle = '#e8e8e8';
        } else {
            const gradient = ctx.createLinearGradient(button.x, button.y, button.x, button.y + button.height);
            if (key === 'checkOrder') {
                gradient.addColorStop(0, '#5c6bc0');
                gradient.addColorStop(1, '#3f51b5');
            } else {
                gradient.addColorStop(0, '#66bb6a');
                gradient.addColorStop(1, '#4caf50');
            }
            ctx.fillStyle = gradient;
        }
        drawRoundedRect(button.x, button.y, button.width, button.height, radius);
        ctx.fill();
        ctx.strokeStyle = isDisabled ? '#d0d0d0' : (key === 'checkOrder' ? '#4a5ba8' : '#43a047');
        ctx.lineWidth = 1.5;
        drawRoundedRect(button.x, button.y, button.width, button.height, radius);
        ctx.stroke();
        if (!isDisabled) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.fillText(button.text, button.x + button.width / 2 + 0.5, button.y + button.height / 2 + 1);
        }
        ctx.fillStyle = isDisabled ? '#a0a0a0' : '#ffffff';
        ctx.fillText(button.text, button.x + button.width / 2, button.y + button.height / 2);
    }
    
    ctx.fillStyle = '#666';
    ctx.font = isMobile() ? '12px Georgia' : '14px Georgia';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const countText = `Checks: ${checkOrderCount}`;
    ctx.fillText(countText, SLOT_START_X, getButtonY() + getButtonHeight() + 8);
    
    if (isDragging && draggedLine) {
        ctx.fillStyle = 'rgba(0, 102, 204, 0.8)';
        ctx.font = isMobile() ? '18px Georgia' : '16px Georgia';
        const dragRectWidth = isMobile() ? canvas.width - 20 : 300;
        ctx.fillRect(dragOffset.x - 5, dragOffset.y - 20, dragRectWidth, isMobile() ? 40 : 30);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const displayText = draggedLine.length > 40 ? draggedLine.substring(0, 40) + '...' : draggedLine;
        ctx.fillText(displayText, dragOffset.x, dragOffset.y);
    }
    
    ctx.textAlign = 'left';
}

function getEventCoordinates(e) {
    const rect = canvas.getBoundingClientRect();
    if (e.touches && e.touches.length > 0) {
        return {
            x: e.touches[0].clientX - rect.left,
            y: e.touches[0].clientY - rect.top
        };
    }
    if (e.changedTouches?.length > 0) {
        return {
            x: e.changedTouches[0].clientX - rect.left,
            y: e.changedTouches[0].clientY - rect.top
        };
    }
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
}

function handlePointerDown(e) {
    const { x, y } = getEventCoordinates(e);
    const slotIndex = getSlotAt(x, y);
    if (slotIndex !== -1 && slots[slotIndex]) {
        draggedLine = slots[slotIndex];
        draggedSlotIndex = slotIndex;
        isDragging = true;
        hasDragged = false;
        dragStartPos = { x, y };
        const pos = getSlotPosition(slotIndex);
        const textX = pos.x + 35;
        const textY = pos.y + getSlotHeight() / 2;
        dragClickOffset = { x: x - textX, y: y - textY };
        dragOffset = { x, y };
        if (e.type === 'touchstart') e.preventDefault();
    }

    for (const [key, button] of Object.entries(getButtons())) {
        if (isPointInButton(x, y, button)) {
            if (!isButtonDisabled(key)) handleButtonClick(key);
            return;
        }
    }
}

canvas.addEventListener('mousedown', handlePointerDown);
canvas.addEventListener('touchstart', handlePointerDown, { passive: false });

function handlePointerMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    const { x: mx, y: my } = getEventCoordinates(e);
    if (Math.hypot(mx - dragStartPos.x, my - dragStartPos.y) > 5) hasDragged = true;
    hoveredSlotIndex = getSlotAt(mx, my);
    dragOffset.x = mx - dragClickOffset.x;
    dragOffset.y = my - dragClickOffset.y;
    render();
}

canvas.addEventListener('mousemove', handlePointerMove);
canvas.addEventListener('touchmove', handlePointerMove, { passive: false });

function handlePointerUp(e) {
    if (isDragging && draggedLine) {
        e.preventDefault();
        const { x, y } = getEventCoordinates(e);
        const slotIndex = getSlotAt(x, y);
        
        if (slotIndex !== -1 && draggedSlotIndex !== null && draggedSlotIndex !== slotIndex) {
            if (slots[slotIndex]) {
                [slots[slotIndex], slots[draggedSlotIndex]] = [draggedLine, slots[slotIndex]];
            } else {
                slots[draggedSlotIndex] = null;
                slots[slotIndex] = draggedLine;
            }
            clearSlotState(slotIndex, draggedSlotIndex);
            hasCheckedAndPassed = false;
        }
        // Dropped outside any slot: line stays in original slot (no change)
        
        isDragging = false;
        hoveredSlotIndex = -1;
        draggedLine = null;
        draggedSlotIndex = null;
        render();
    }
}

canvas.addEventListener('mouseup', handlePointerUp);
canvas.addEventListener('touchend', handlePointerUp);
canvas.addEventListener('touchcancel', handlePointerUp); // Handle touch cancellation

function handleButtonClick(buttonKey) {
    if (buttonKey === 'checkOrder') {
        checkOrder();
    } else if (buttonKey === 'newSonnet') {
        initGame();
    }
}

function getShakeOffset() {
    if (!shakeStartTime) return 0;
    const elapsed = Date.now() - shakeStartTime;
    const duration = 500;
    if (elapsed >= duration) {
        shakingSlots.clear();
        shakeStartTime = null;
        if (shakeAnimationFrame) {
            cancelAnimationFrame(shakeAnimationFrame);
            shakeAnimationFrame = null;
        }
        return 0;
    }
    
    const frequency = 20;
    const amplitude = 10 * (1 - elapsed / duration);
    return Math.sin(elapsed * frequency * Math.PI / 1000) * amplitude;
}

function animateShake() {
    if (shakingSlots.size === 0) {
        shakeAnimationFrame = null;
        return;
    }
    render();
    shakeAnimationFrame = requestAnimationFrame(animateShake);
}

function checkOrder() {
    if (!currentSonnet) return;
    checkOrderCount++;
    incorrectSlots.clear();
    slots.forEach((content, i) => { if (content) checkedSlots.add(i); });

    const slotsToShake = new Set();
    for (let i = 0; i < slots.length; i++) {
        const content = slots[i];
        const expected = i < currentSonnet.length ? currentSonnet[i] : null;
        const wrong = !content || content !== expected;
        if (wrong) {
            slotsToShake.add(i);
            if (content) incorrectSlots.add(i);
        }
    }

    if (slotsToShake.size > 0) {
        hasCheckedAndPassed = false;
        shakingSlots = slotsToShake;
        shakeStartTime = Date.now();
        if (!shakeAnimationFrame) {
            render();
            shakeAnimationFrame = requestAnimationFrame(animateShake);
        }
    } else {
        hasCheckedAndPassed = true;
        incorrectSlots.clear();
        render();
    }
}

function handleResize() {
    setCanvasSize();
    render();
}

window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', () => setTimeout(handleResize, 100));
initGame();

