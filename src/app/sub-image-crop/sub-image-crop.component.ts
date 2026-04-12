import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, AfterViewInit, OnChanges, SimpleChanges } from '@angular/core';

const CROP = 256;
const CROSSHAIR_SIZE = 32;
const CROSSHAIR_IMG = new Image();
/** Callbacks waiting for the crosshair image to load. */
const crosshairCallbacks: Array<() => void> = [];
CROSSHAIR_IMG.onload = () => { crosshairCallbacks.forEach(cb => cb()); crosshairCallbacks.length = 0; };
CROSSHAIR_IMG.src = './assets/crosshair.png';

@Component({
    selector: 'app-sub-image-crop',
    template: `
        <div class="crop-wrapper"
             [class.selected]="isSelected"
             [style.borderColor]="borderColor">
            <canvas #canvas [width]="CROP" [height]="CROP" (click)="onCanvasClick($event)"></canvas>
            <div *ngIf="heading !== null" class="compass-overlay"
                 [title]="'North indicator | Camera tilt: ' + (pitch !== null ? (90 + pitch).toFixed(0) + '°' : 'N/A')">
                <svg viewBox="0 0 20 20" width="18" height="18"
                     [style.transform]="'rotate(' + (-heading) + 'deg)'"
                     style="display:block;flex-shrink:0">
                    <polygon points="10,2 13,11 10,9 7,11" fill="#e74c3c"/>
                    <polygon points="10,18 13,11 10,9 7,11" fill="#ccc"/>
                </svg>
                <ng-container *ngIf="pitch !== null">
                    <svg viewBox="0 0 16 12" width="12" height="9" style="display:block;flex-shrink:0">
                        <rect x="0.5" y="3" width="15" height="8.5" rx="1.5" stroke="white" stroke-width="1.2" fill="none"/>
                        <rect x="5.5" y="1" width="4" height="2.5" rx="0.5" stroke="white" stroke-width="1" fill="none"/>
                        <circle cx="8" cy="7.5" r="2.8" stroke="white" stroke-width="1.2" fill="none"/>
                    </svg>
                    <span style="color:white;font-size:9px;line-height:1;white-space:nowrap">{{(90 + pitch).toFixed(0)}}°</span>
                </ng-container>
            </div>
        </div>
        <div class="crop-label" [title]="imgName">{{imgName}}</div>
    `,
    styles: [`
        :host { display: block; padding: 4px; cursor: pointer; }
        .crop-wrapper {
            border: 3px solid #6c757d;
            display: inline-block;
            line-height: 0;
            position: relative;
        }
        .crop-wrapper.selected { outline: 3px solid #007bff; outline-offset: 1px; }
        .compass-overlay {
            position: absolute;
            top: 4px;
            left: 4px;
            background: rgba(0,0,0,0.45);
            border-radius: 12px;
            padding: 3px 5px 3px 3px;
            display: flex;
            align-items: center;
            gap: 3px;
            pointer-events: none;
        }
        canvas { display: block; }
        .crop-label {
            font-size: 10px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: ${CROP}px;
            text-align: center;
            margin-top: 2px;
        }
    `]
})
export class SubImageCropComponent implements AfterViewInit, OnChanges {
    @Input() imgUrl: string;
    @Input() imgName: string;
    @Input() imX: number;
    @Input() imY: number;
    @Input() confirmed: boolean;
    @Input() hasEstimate: boolean;
    @Input() isSelected: boolean;
    /** Optional bounding box of the detected marker; drives adaptive zoom when present. */
    @Input() markerBbox: { x1: number; y1: number; x2: number; y2: number } | null = null;
    /** Camera yaw heading in degrees clockwise from north, or null if unavailable. */
    @Input() heading: number | null = null;
    /** Camera gimbal pitch in degrees (-90 = nadir, 0 = horizontal), or null if unavailable. */
    @Input() pitch: number | null = null;
    /** Emits full-image pixel coords when user clicks in the crop canvas. */
    @Output() clickPosition = new EventEmitter<{x: number, y: number}>();
    /** Emits when user shift-clicks to un-tag (revert confirmed→estimated). */
    @Output() unpin = new EventEmitter<void>();

    @ViewChild('canvas') canvasRef: ElementRef<HTMLCanvasElement>;

    public CROP = CROP;

    private _img: HTMLImageElement = null;
    private _viewReady = false;

    get borderColor(): string {
        if (this.confirmed) return '#28a745';
        if (this.hasEstimate) return '#ffc107';
        return '#6c757d';
    }

    ngAfterViewInit() {
        this._viewReady = true;
        this._loadAndDraw();
    }

    ngOnChanges(changes: SimpleChanges) {
        if (!this._viewReady) return;
        // If the source image changed, reload; otherwise just redraw.
        if (changes['imgUrl']) {
            this._img = null;
        }
        this._loadAndDraw();
    }

    private _loadAndDraw() {
        if (!this.imgUrl) {
            this._clearCanvas();
            return;
        }
        if (this._img && this._img.src === this.imgUrl) {
            this._draw();
            return;
        }
        const img = new Image();
        img.onload = () => {
            this._img = img;
            this._draw();
        };
        img.onerror = () => this._clearCanvas();
        img.src = this.imgUrl;
    }

    private _clearCanvas() {
        const canvas = this.canvasRef?.nativeElement;
        if (!canvas) return;
        canvas.getContext('2d').clearRect(0, 0, CROP, CROP);
    }

    /** Compute the source region to draw from the full image into the CROP×CROP canvas. */
    private _getSourceRect(): { sx: number; sy: number; sw: number; sh: number } {
        const cx = this.imX || 0;
        const cy = this.imY || 0;
        const nw = this._img.naturalWidth;
        const nh = this._img.naturalHeight;

        if (this.markerBbox) {
            const bw = this.markerBbox.x2 - this.markerBbox.x1;
            const bh = this.markerBbox.y2 - this.markerBbox.y1;
            const pad = Math.max(bw, bh) * 0.1;
            const dim = Math.max(bw + 2 * pad, bh + 2 * pad);
            const sw = Math.min(dim, nw);
            const sh = Math.min(dim, nh);
            const sx = Math.max(0, Math.min(cx - dim / 2, nw - sw));
            const sy = Math.max(0, Math.min(cy - dim / 2, nh - sh));
            return { sx, sy, sw, sh };
        }

        const half = CROP / 2;
        const sx = Math.max(0, Math.min(cx - half, nw - CROP));
        const sy = Math.max(0, Math.min(cy - half, nh - CROP));
        return { sx, sy, sw: CROP, sh: CROP };
    }

    private _draw() {
        const canvas = this.canvasRef?.nativeElement;
        if (!canvas || !this._img) return;

        const ctx = canvas.getContext('2d');
        const cx = this.imX || 0;
        const cy = this.imY || 0;
        const { sx, sy, sw, sh } = this._getSourceRect();

        ctx.clearRect(0, 0, CROP, CROP);
        ctx.drawImage(this._img, sx, sy, sw, sh, 0, 0, CROP, CROP);

        // Draw marker at GCP position within crop.
        // Confirmed: crosshair.png; Estimate: yellow + with dark outline.
        if (this.hasEstimate || this.confirmed) {
            const px = (cx - sx) * (CROP / sw);
            const py = (cy - sy) * (CROP / sh);
            if (this.confirmed) {
                const drawCrosshair = () => {
                    ctx.drawImage(CROSSHAIR_IMG, px - CROSSHAIR_SIZE / 2, py - CROSSHAIR_SIZE / 2, CROSSHAIR_SIZE, CROSSHAIR_SIZE);
                };
                if (CROSSHAIR_IMG.complete && CROSSHAIR_IMG.naturalWidth > 0) {
                    drawCrosshair();
                } else {
                    crosshairCallbacks.push(() => this._draw());
                }
            } else {
                // Yellow + for unconfirmed estimates
                const arm = 10;
                ctx.save();
                // Dark outline for visibility against any background
                ctx.strokeStyle = 'rgba(0,0,0,0.7)';
                ctx.lineWidth = 5;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(px - arm, py); ctx.lineTo(px + arm, py);
                ctx.moveTo(px, py - arm); ctx.lineTo(px, py + arm);
                ctx.stroke();
                // Yellow fill
                ctx.strokeStyle = '#ffc107';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(px - arm, py); ctx.lineTo(px + arm, py);
                ctx.moveTo(px, py - arm); ctx.lineTo(px, py + arm);
                ctx.stroke();
                ctx.restore();
            }
        }
    }

    public onCanvasClick(e: MouseEvent): void {
        if (!this._img) return;
        if (e.shiftKey) {
            this.unpin.emit();
            return;
        }
        const { sx, sy, sw, sh } = this._getSourceRect();
        this.clickPosition.emit({
            x: sx + e.offsetX * (sw / CROP),
            y: sy + e.offsetY * (sh / CROP),
        });
    }
}
