import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, AfterViewInit, OnChanges, SimpleChanges } from '@angular/core';

const CROP = 256;

@Component({
    selector: 'app-sub-image-crop',
    template: `
        <div class="crop-wrapper"
             [class.selected]="isSelected"
             [style.borderColor]="borderColor"
             (click)="selectCrop.emit()">
            <canvas #canvas [width]="CROP" [height]="CROP"></canvas>
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
    @Output() selectCrop = new EventEmitter<void>();

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

        // Draw crosshair at GCP position within crop
        if (this.hasEstimate || this.confirmed) {
            const px = cx - sx;
            const py = cy - sy;
            ctx.strokeStyle = this.confirmed ? '#28a745' : '#ffc107';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(px - 12, py); ctx.lineTo(px + 12, py);
            ctx.moveTo(px, py - 12); ctx.lineTo(px, py + 12);
            ctx.stroke();
        }
    }
}
