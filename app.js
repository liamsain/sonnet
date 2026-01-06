import { sonnets } from './data.js';

function getRandomSonnet() {
    // sonnets is an array where each element is a sonnet string with newline-separated lines
    // Filter out sonnets with less than 14 lines
    const validSonnets = sonnets.filter(sonnet => {
        const lines = sonnet.split('\n').filter(line => line.trim() !== '');
        return lines.length >= 14;
    });
    
    if (validSonnets.length === 0) {
        console.error('No valid sonnets found');
        return null;
    }
    
    // Get random sonnet
    const randomIndex = Math.floor(Math.random() * validSonnets.length);
    const selectedSonnet = validSonnets[randomIndex];
    
    // Split by newlines, filter out empty lines, and take first 14 lines
    const lines = selectedSonnet.split('\n')
        .map(line => line.trim())
        .filter(line => line !== '')
        .slice(0, 14);
    
    return lines;
}

// Game state
let currentSonnet = null;
let currentLineIndex = 0;
let slots = Array(14).fill(null); // 14 slots (one for each line of a sonnet)
let draggedLine = null;
let draggedSlotIndex = null;
let isDragging = false;
let dragOffset = { x: 0, y: 0 };
let dragClickOffset = { x: 0, y: 0 }; // Offset between click position and text position
let hasDragged = false; // Track if user actually dragged (moved mouse)
let dragStartPos = { x: 0, y: 0 }; // Track where drag started
let hoveredSlotIndex = -1; // Track which slot is being hovered over while dragging
let shakingSlots = new Set(); // Set of slot indices that are shaking
let shakeAnimationFrame = null;
let shakeStartTime = null;
let currentLineDropped = false; // Track if current line has been dropped
let incorrectSlots = new Set(); // Set of slot indices that have incorrect content
let checkedSlots = new Set(); // Set of slot indices that have been checked
let checkOrderCount = 0; // Count how many times check order has been clicked for current sonnet

// Mobile detection
function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           (window.innerWidth <= 768);
}

// Canvas setup
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Constants - adjust for mobile (must be defined before functions that use them)
const SLOT_MARGIN = 5;
const SLOTS_PER_ROW = 1;
const SLOT_START_X = 28;
const SLOT_START_Y = isMobile() ? 100 : 90;
const CURRENT_LINE_Y = 80;
const BUTTON_Y = isMobile() ? 15 : 20;
const BUTTON_WIDTH = isMobile() ? 130 : 150;
const BUTTON_HEIGHT = isMobile() ? 40 : 35;
const BUTTON_MARGIN = 20;

// Functions to get responsive values
function getSlotWidth() {
    return isMobile() ? canvas.width - 56 : 480;
}

function getSlotHeight() {
    return isMobile() ? 60 : 40; // Taller slots on mobile to accommodate wrapped text
}

// Calculate required canvas height
function calculateCanvasHeight() {
    if (isMobile()) {
        // Calculate: button area + 14 slots with spacing + padding
        const slotsArea = SLOT_START_Y + (14 * (getSlotHeight() + SLOT_MARGIN)) + 30; // 14 slots + padding
        return slotsArea; // Return exact height needed
    }
    return 775; // Desktop default
}

// Adjust canvas size for mobile
if (isMobile()) {
    const maxWidth = Math.min(window.innerWidth - 40, 500);
    canvas.width = maxWidth;
    canvas.height = calculateCanvasHeight();
}

// Button definitions
const buttons = {
    checkOrder: { x: SLOT_START_X, y: BUTTON_Y, text: 'Check Order', width: BUTTON_WIDTH, height: BUTTON_HEIGHT },
    newSonnet: { x: SLOT_START_X + BUTTON_WIDTH + BUTTON_MARGIN, y: BUTTON_Y, text: 'New Sonnet', width: BUTTON_WIDTH, height: BUTTON_HEIGHT }
};

// Check if at least one line has been placed
function hasAtLeastOneLinePlaced() {
    for (let i = 0; i < slots.length; i++) {
        if (slots[i]) {
            return true;
        }
    }
    return false;
}

// Check if all lines from the sonnet have been placed
function areAllLinesPlaced() {
    if (!currentSonnet || currentSonnet.length === 0) return false;
    
    // Get all lines currently in slots
    const placedLines = new Set();
    for (let i = 0; i < slots.length; i++) {
        if (slots[i]) {
            placedLines.add(slots[i]);
        }
    }
    
    // Check if all sonnet lines are placed
    for (let i = 0; i < currentSonnet.length; i++) {
        if (!placedLines.has(currentSonnet[i])) {
            return false;
        }
    }
    return true;
}

// Check if all lines are placed and in the correct order
function isOrderCorrect() {
    if (!currentSonnet || currentSonnet.length === 0) return false;
    
    // Check if all slots have the correct lines in the correct order
    for (let i = 0; i < currentSonnet.length; i++) {
        if (slots[i] !== currentSonnet[i]) {
            return false;
        }
    }
    
    // Also check that there are no lines beyond the sonnet length
    for (let i = currentSonnet.length; i < slots.length; i++) {
        if (slots[i]) {
            return false;
        }
    }
    
    return true;
}

// Get a random line index from the sonnet that hasn't been placed in any slot
function getRandomUnplacedLineIndex() {
    if (!currentSonnet || currentSonnet.length === 0) return null;
    
    // Get all lines currently in slots
    const placedLines = new Set();
    for (let i = 0; i < slots.length; i++) {
        if (slots[i]) {
            placedLines.add(slots[i]);
        }
    }
    
    // Get indices of lines that haven't been placed
    const unplacedIndices = [];
    for (let i = 0; i < currentSonnet.length; i++) {
        if (!placedLines.has(currentSonnet[i])) {
            unplacedIndices.push(i);
        }
    }
    
    // If all lines are placed, return null (or could return a random one anyway)
    if (unplacedIndices.length === 0) {
        return null;
    }
    
    // Return a random unplaced line index
    const randomIndex = Math.floor(Math.random() * unplacedIndices.length);
    return unplacedIndices[randomIndex];
}

// Initialize game
function initGame() {
    currentSonnet = getRandomSonnet();
    if (!currentSonnet) {
        alert('Failed to load sonnets.');
        return;
    }
    
    // Shuffle the sonnet lines
    const shuffledLines = [...currentSonnet];
    for (let i = shuffledLines.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledLines[i], shuffledLines[j]] = [shuffledLines[j], shuffledLines[i]];
    }
    
    // Place shuffled lines randomly in slots
    slots = Array(14).fill(null);
    const slotIndices = Array.from({ length: 14 }, (_, i) => i);
    // Shuffle slot indices
    for (let i = slotIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [slotIndices[i], slotIndices[j]] = [slotIndices[j], slotIndices[i]];
    }
    
    // Place lines in random slots
    for (let i = 0; i < Math.min(shuffledLines.length, slots.length); i++) {
        slots[slotIndices[i]] = shuffledLines[i];
    }
    
    incorrectSlots.clear(); // Clear incorrect slots on new game
    checkedSlots.clear(); // Clear checked slots on new game
    checkOrderCount = 0; // Reset check order count
    render();
}

// Get slot position
function getSlotPosition(index) {
    const row = Math.floor(index / SLOTS_PER_ROW);
    const col = index % SLOTS_PER_ROW;
    return {
        x: SLOT_START_X + col * (getSlotWidth() + SLOT_MARGIN),
        y: SLOT_START_Y + row * (getSlotHeight() + SLOT_MARGIN)
    };
}

// Get slot index from coordinates
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

// Render text with word wrapping
function drawWrappedText(text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let currentY = y;
    
    for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + ' ';
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;
        
        if (testWidth > maxWidth && i > 0) {
            ctx.fillText(line, x, currentY);
            line = words[i] + ' ';
            currentY += lineHeight;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line, x, currentY);
    return currentY;
}

// Render the canvas
function render() {
    // Clear canvas with paper-like color
    ctx.fillStyle = '#faf8f5';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw current line
    ctx.fillStyle = '#333';
    ctx.font = '18px Georgia';
    ctx.textBaseline = 'top';
    
    // Draw slots
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
        
        // Draw line number to the left of the slot
        const lineNumber = i + 1;
        ctx.fillStyle = '#999';
        ctx.font = isMobile() ? '16px Georgia' : '14px Georgia';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${lineNumber}`, x - 6, pos.y + getSlotHeight() / 2);
        ctx.textAlign = 'left';
        
        // Draw line text if slot is filled
        if (slots[i]) {
            ctx.fillStyle = '#333';
            const fontSize = isMobile() ? '16px' : '16px'; // Smaller font on mobile for better fit
            ctx.font = fontSize + ' Georgia';
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
    
    // Draw pronounced dotted blue borders on all slots when dragging
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
        ctx.setLineDash([]); // Reset line dash
    }
    
    // Draw buttons
    ctx.font = isMobile() ? '16px Georgia' : '15px Georgia';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    for (const [key, button] of Object.entries(buttons)) {
        // Check if button should be disabled
        let isDisabled = false;
        if (key === 'checkOrder') {
            isDisabled = !hasAtLeastOneLinePlaced();
        } else if (key === 'newSonnet') {
            isDisabled = !isOrderCorrect();
        }
        
        const radius = 6;
        
        // Button shadow
        if (!isDisabled) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
            drawRoundedRect(button.x + 1, button.y + 2, button.width, button.height, radius);
            ctx.fill();
        }
        
        // Button background with gradient effect
        if (isDisabled) {
            ctx.fillStyle = '#e8e8e8';
        } else {
            // Create a subtle gradient effect
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
        
        // Button border
        ctx.strokeStyle = isDisabled ? '#d0d0d0' : (key === 'checkOrder' ? '#4a5ba8' : '#43a047');
        ctx.lineWidth = 1.5;
        drawRoundedRect(button.x, button.y, button.width, button.height, radius);
        ctx.stroke();
        
        // Button text with subtle shadow for enabled buttons
        if (!isDisabled) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.fillText(button.text, button.x + button.width / 2 + 0.5, button.y + button.height / 2 + 1);
        }
        ctx.fillStyle = isDisabled ? '#a0a0a0' : '#ffffff';
        ctx.fillText(button.text, button.x + button.width / 2, button.y + button.height / 2);
    }
    
    // Draw check order count to the right of New Sonnet button
    ctx.fillStyle = '#666';
    ctx.font = isMobile() ? '12px Georgia' : '14px Georgia';
    ctx.textAlign = 'left';
    const countText = `Checks: ${checkOrderCount}`;
    ctx.fillText(countText, buttons.newSonnet.x + buttons.newSonnet.width + 10, buttons.newSonnet.y + buttons.newSonnet.height / 2);
    
    // Draw dragged line if dragging
    if (isDragging && draggedLine) {
        // dragOffset now represents where the text should be drawn (maintaining relative position)
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

// Mouse event handlers
let mouseDown = false;
let mouseDownX = 0;
let mouseDownY = 0;

// Helper function to get coordinates from mouse or touch event
function getEventCoordinates(e) {
    const rect = canvas.getBoundingClientRect();
    if (e.touches && e.touches.length > 0) {
        return {
            x: e.touches[0].clientX - rect.left,
            y: e.touches[0].clientY - rect.top
        };
    } else if (e.changedTouches && e.changedTouches.length > 0) {
        // For touchend events, use changedTouches
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
    const coords = getEventCoordinates(e);
    const x = coords.x;
    const y = coords.y;
    
    mouseDown = true;
    mouseDownX = x;
    mouseDownY = y;
    
    // Check if clicking on a filled slot
    const slotIndex = getSlotAt(x, y);
    if (slotIndex !== -1 && slots[slotIndex]) {
        draggedLine = slots[slotIndex];
        draggedSlotIndex = slotIndex;
        isDragging = true;
        hasDragged = false; // Reset drag flag
        dragStartPos = { x: x, y: y }; // Store start position
        // Calculate offset between click position and where the text is actually displayed
        const pos = getSlotPosition(slotIndex);
        const lineNumberWidth = 30; // Space reserved for line number
        const textX = pos.x + lineNumberWidth + 5; // Text starts after line number
        const textY = pos.y + getSlotHeight() / 2; // Text is vertically centered
        dragClickOffset = { x: x - textX, y: y - textY };
        dragOffset = { x: x, y: y };
        // Only prevent default if we're starting a drag
        if (e.type === 'touchstart') {
            e.preventDefault();
        }
    }
    
    // Check button clicks
    for (const [key, button] of Object.entries(buttons)) {
        if (isPointInButton(x, y, button)) {
            // Check if button is disabled
            let isDisabled = false;
            if (key === 'checkOrder') {
                isDisabled = !hasAtLeastOneLinePlaced();
            } else if (key === 'newSonnet') {
                isDisabled = !isOrderCorrect();
            }
            if (!isDisabled) {
                handleButtonClick(key);
            }
            return;
        }
    }
}

canvas.addEventListener('mousedown', handlePointerDown);
canvas.addEventListener('touchstart', handlePointerDown, { passive: false });

function handlePointerMove(e) {
    if (isDragging) {
        e.preventDefault(); // Prevent scrolling while dragging
        const coords = getEventCoordinates(e);
        const mouseX = coords.x;
        const mouseY = coords.y;
        
        // Check if mouse has moved significantly (more than 5 pixels)
        const moveDistance = Math.sqrt(
            Math.pow(mouseX - dragStartPos.x, 2) + 
            Math.pow(mouseY - dragStartPos.y, 2)
        );
        if (moveDistance > 5) {
            hasDragged = true;
        }
        
        // Check which slot is being hovered over
        const slotIndex = getSlotAt(mouseX, mouseY);
        if (hoveredSlotIndex !== slotIndex) {
            hoveredSlotIndex = slotIndex;
        }
        
        // Maintain relative position by subtracting the click offset
        dragOffset.x = mouseX - dragClickOffset.x;
        dragOffset.y = mouseY - dragClickOffset.y;
        render();
    }
}

canvas.addEventListener('mousemove', handlePointerMove);
canvas.addEventListener('touchmove', handlePointerMove, { passive: false });

function handlePointerUp(e) {
    if (isDragging && draggedLine) {
        e.preventDefault();
        const coords = getEventCoordinates(e);
        const x = coords.x;
        const y = coords.y;
        
        const slotIndex = getSlotAt(x, y);
        
        if (slotIndex !== -1) {
            // If dragging from a slot to another slot
            if (draggedSlotIndex !== null && draggedSlotIndex !== slotIndex) {
                // If destination slot has content, swap them
                if (slots[slotIndex]) {
                    const destinationContent = slots[slotIndex];
                    slots[slotIndex] = draggedLine;
                    slots[draggedSlotIndex] = destinationContent;
                    // Clear incorrect status for both slots since they've been modified
                    incorrectSlots.delete(slotIndex);
                    incorrectSlots.delete(draggedSlotIndex);
                    checkedSlots.delete(slotIndex); // Uncheck modified slots
                    checkedSlots.delete(draggedSlotIndex);
                } else {
                    // Destination is empty, just move the content
                    slots[draggedSlotIndex] = null;
                    slots[slotIndex] = draggedLine;
                    incorrectSlots.delete(draggedSlotIndex);
                    incorrectSlots.delete(slotIndex);
                    checkedSlots.delete(slotIndex); // Uncheck modified slot
                    checkedSlots.delete(draggedSlotIndex); // Uncheck source slot (now empty)
                }
            } else {
                // Dropping from same slot (no change needed, but handle for completeness)
                // This shouldn't happen, but if it does, just update the slot
                slots[slotIndex] = draggedLine;
                incorrectSlots.delete(slotIndex); // Clear incorrect status when slot is modified
                checkedSlots.delete(slotIndex); // Uncheck this slot since it was modified
            }
        } else if (draggedSlotIndex !== null) {
            // Dropped outside, clear the slot
            slots[draggedSlotIndex] = null;
            incorrectSlots.delete(draggedSlotIndex); // Clear incorrect status
            checkedSlots.delete(draggedSlotIndex); // Uncheck this slot since it was modified
        }
        
        isDragging = false;
        hoveredSlotIndex = -1; // Clear hover state
        draggedLine = null;
        draggedSlotIndex = null;
        
        render();
    }
    mouseDown = false;
}

canvas.addEventListener('mouseup', handlePointerUp);
canvas.addEventListener('touchend', handlePointerUp);
canvas.addEventListener('touchcancel', handlePointerUp); // Handle touch cancellation

// Button click handlers
function handleButtonClick(buttonKey) {
    if (buttonKey === 'checkOrder') {
        checkOrder();
    } else if (buttonKey === 'newSonnet') {
        initGame();
    }
}

// Get shake offset for animation
function getShakeOffset() {
    if (!shakeStartTime) return 0;
    const elapsed = Date.now() - shakeStartTime;
    const duration = 500; // 500ms shake duration
    if (elapsed >= duration) {
        shakingSlots.clear();
        shakeStartTime = null;
        if (shakeAnimationFrame) {
            cancelAnimationFrame(shakeAnimationFrame);
            shakeAnimationFrame = null;
        }
        return 0;
    }
    
    // Create shake effect: rapid horizontal oscillation that decreases over time
    const frequency = 20; // oscillations per second
    const amplitude = 10 * (1 - elapsed / duration); // decreasing amplitude
    return Math.sin(elapsed * frequency * Math.PI / 1000) * amplitude;
}

// Shake animation loop
function animateShake() {
    if (shakingSlots.size === 0) {
        shakeAnimationFrame = null;
        return;
    }
    render();
    shakeAnimationFrame = requestAnimationFrame(animateShake);
}

// Check if order is correct
function checkOrder() {
    if (!currentSonnet) return;
    
    // Increment check order count
    checkOrderCount++;
    
    // Clear previous incorrect slots
    incorrectSlots.clear();
    
    // Mark all filled slots as checked
    for (let i = 0; i < slots.length; i++) {
        if (slots[i]) {
            checkedSlots.add(i);
        }
    }
    
    // Identify incorrect or empty slots (for shaking)
    const slotsToShake = new Set();
    
    for (let i = 0; i < slots.length; i++) {
        const slotContent = slots[i];
        const expectedLine = i < currentSonnet.length ? currentSonnet[i] : null;
        
        // Slot is incorrect if:
        // 1. It's empty (all empty slots should shake)
        // 2. It has a line but it's the wrong line (within sonnet length)
        // 3. It has content but shouldn't (beyond sonnet length)
        if (!slotContent) {
            slotsToShake.add(i);
        } else if (slotContent && expectedLine && slotContent !== expectedLine) {
            slotsToShake.add(i);
            incorrectSlots.add(i); // Mark as incorrect for red coloring
        } else if (slotContent && !expectedLine) {
            // Has content but shouldn't (beyond sonnet length)
            slotsToShake.add(i);
            incorrectSlots.add(i); // Mark as incorrect for red coloring
        }
    }
    
    // Start shake animation for incorrect/empty slots
    if (slotsToShake.size > 0) {
        shakingSlots = slotsToShake;
        shakeStartTime = Date.now();
        if (!shakeAnimationFrame) {
            render(); // Initial render
            shakeAnimationFrame = requestAnimationFrame(animateShake);
        }
    } else {
        // If all slots are correct, clear incorrect slots
        incorrectSlots.clear();
        render();
    }
}

// Handle window resize for mobile orientation changes
function handleResize() {
    if (isMobile()) {
        const maxWidth = Math.min(window.innerWidth - 40, 500);
        canvas.width = maxWidth;
        canvas.height = calculateCanvasHeight();
        render();
    }
}

window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', () => {
    setTimeout(handleResize, 100); // Small delay for orientation change
});

// Initialize on load
initGame();

