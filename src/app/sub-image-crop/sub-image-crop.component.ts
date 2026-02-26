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
        </div>
        <div class="crop-label" [title]="imgName">{{imgName}}</div>
    `,
    styles: [`
        :host { display: block; padding: 4px; cursor: pointer; }
        .crop-wrapper {
            border: 3px solid #6c757d;
            display: inline-block;
            line-height: 0;
        }
        .crop-wrapper.selected { outline: 3px solid #007bff; outline-offset: 1px; }
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
    /** Emits full-image pixel coords when user clicks in the crop canvas. */
    @Output() clickPosition = new EventEmitter<{x: number, y: number}>();

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

    private _draw() {
        const canvas = this.canvasRef?.nativeElement;
        if (!canvas || !this._img) return;

        const ctx = canvas.getContext('2d');
        const half = CROP / 2;
        const cx = this.imX || 0;
        const cy = this.imY || 0;

        // Clamp source rect to image bounds
        const sx = Math.max(0, Math.min(cx - half, this._img.naturalWidth  - CROP));
        const sy = Math.max(0, Math.min(cy - half, this._img.naturalHeight - CROP));

        ctx.clearRect(0, 0, CROP, CROP);
        ctx.drawImage(this._img, sx, sy, CROP, CROP, 0, 0, CROP, CROP);

        // Draw crosshair.png at GCP position within crop.
        // Yellow (no filter) = unconfirmed estimate; green filter = confirmed.
        if (this.hasEstimate || this.confirmed) {
            const px = cx - sx;
            const py = cy - sy;
            const drawCrosshair = () => {
                ctx.save();
                if (this.confirmed) {
                    ctx.filter = 'hue-rotate(100deg) saturate(3) brightness(1.2)';
                }
                ctx.drawImage(CROSSHAIR_IMG, px - CROSSHAIR_SIZE / 2, py - CROSSHAIR_SIZE / 2, CROSSHAIR_SIZE, CROSSHAIR_SIZE);
                ctx.restore();
            };
            if (CROSSHAIR_IMG.complete && CROSSHAIR_IMG.naturalWidth > 0) {
                drawCrosshair();
            } else {
                crosshairCallbacks.push(() => this._draw());
            }
        }
    }

    public onCanvasClick(e: MouseEvent): void {
        if (!this._img) return;
        const half = CROP / 2;
        const sx = Math.max(0, Math.min(this.imX - half, this._img.naturalWidth  - CROP));
        const sy = Math.max(0, Math.min(this.imY - half, this._img.naturalHeight - CROP));
        this.clickPosition.emit({ x: sx + e.offsetX, y: sy + e.offsetY });
    }
}
