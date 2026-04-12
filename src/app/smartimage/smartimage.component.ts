import { Component, OnInit, OnChanges, SimpleChanges, Output, EventEmitter, Input, ViewChild, ElementRef, AfterViewInit, HostListener, ChangeDetectorRef } from '@angular/core';
import * as Panzoom from '@panzoom/panzoom';
import { fromEvent, timer, TimeoutError } from 'rxjs';
import { CoordsXY } from '../../shared/common';

@Component({
    selector: 'app-smartimage',
    templateUrl: './smartimage.component.html',
    styleUrls: ['./smartimage.component.scss']
})
export class SmartimageComponent implements OnInit, OnChanges, AfterViewInit {
    showMessage: boolean;

    constructor(private el: ElementRef) { }

    @Input()
    get pinLocation() {
        return this.pinLocationValue;
    }

    set pinLocation(val) {
        this.pinLocationValue = val;
        this.syncPinPosition();
        this.pinLocationChange.emit(this.pinLocationValue);
    }

    @Output() public pin = new EventEmitter();
    @Output() public unpin = new EventEmitter<void>();
    @Input() public src: string;
    /** Whether the pin position is user-confirmed (crosshair) vs estimated (yellow +). */
    @Input() public confirmed: boolean = false;
    /** When true, zoom/pan the image to fit its container on each load. Use in fixed-size panels. */
    @Input() public autoFit: boolean = false;
    /** Crop-box to draw on the large image (matches the selected sub-image crop). */
    @Input() public cropBox: { imX: number; imY: number; color: string; sourceSize?: number } | null = null;
    /**
     * When set, zoom the image to match the sub-image crop scale (same pixels-per-display-pixel)
     * and pan to center the given source coordinate, clamped to avoid black bars.
     * Takes priority over autoFit.
     */
    @Input() public cropFocus: { x: number; y: number; pixelsPerPx: number } | null = null;
    @ViewChild('img') img: ElementRef;
    @ViewChild('pin') pinDiv: ElementRef;
    @ViewChild('cropBoxDiv') cropBoxDiv: ElementRef;

    pinLocationValue: CoordsXY = null;
    onSmartImagesLayoutChanged = null;

    private panzoom: Panzoom.PanzoomObject = null;

    @Output()
    pinLocationChange = new EventEmitter<CoordsXY>();

    ngOnChanges(changes: SimpleChanges) {
        if (changes['cropBox']) {
            this.syncCropBox();
        }
        // When confirmed state changes, the pin element swaps (crosshair ↔ yellow +);
        // re-sync its position after Angular updates the DOM.
        if (changes['confirmed'] && this.pinLocationValue !== null) {
            setTimeout(() => this.syncPinPosition(), 0);
        }
        // NOTE: cropFocus is intentionally NOT handled here to avoid an infinite
        // zone.js loop (new object reference each call → ngOnChanges → panzoom event
        // → zone detects change → repeat). Focus is applied in _updateView(), called
        // from onLoad() and from onResize(). When [src] changes (user selects a
        // different image), onLoad fires and picks up the current cropFocus value.
    }

    @HostListener('window:resize', ['$event'])
    onResize(event) {
        this._updateView();
        this.syncPinPosition();
        this.syncCropBox();
    }

    ngAfterViewInit(): void {
        this.panzoom = Panzoom.default(this.img.nativeElement, {
            maxScale: 300,
            cursor: 'default',
            animate: false,
            canvas: true,
            step: 0.7,
            overflow: "visible"
        });

        const click = fromEvent(this.img.nativeElement, 'click');

        let start = Date.now();

        let timeout: any = null;

        const panzoomchange = fromEvent(this.img.nativeElement, 'panzoomchange');

        panzoomchange.subscribe((e: CustomEvent) => {

            if (this.pinLocation != null) {

                this.pinDiv.nativeElement.style.display = 'none';

                if (timeout !== null) {
                    clearTimeout(timeout);
                    timeout = null;
                }

                timeout = setTimeout(() => {
                    this.syncPinPosition();
                    this.syncCropBox();
                    this.pinDiv.nativeElement.style.display = 'block';
                }, 250);
            }

            start = Date.now();

        });

        click.subscribe((e: MouseEvent) => {

            const millis = Date.now() - start;

            start = Date.now();

            if (millis > 250) {

                // Shift-click: un-tag (revert confirmed→estimated).
                if (e.shiftKey) {
                    if (this.pinLocationValue !== null) {
                        this.unpin.emit();
                    }
                    return;
                }

                this.pinLocation = this.getPos(e);

                const rect = this.img.nativeElement.parentElement.getClientRects()[0];

                this.pinDiv.nativeElement.style.left = (e.clientX - rect.left - 16) + 'px';
                this.pinDiv.nativeElement.style.top = (e.clientY - rect.top - 16) + 'px';

                this.pin.emit(this.pinLocation);

            }
        });

        this.img.nativeElement.parentElement.addEventListener('wheel', (e: WheelEvent) => {
            // Zoom centered on mouse cursor position.
            // On Mac, shift+scroll translates to horizontal (deltaX); handle both axes.
            const delta = e.deltaY === 0 && e.deltaX ? e.deltaX : e.deltaY;
            const wheel = delta < 0 ? 1 : -1;
            const toScale = Math.min(300, Math.max(0.125, this.panzoom.getScale() * Math.exp((wheel * 0.7) / 3)));
            this.panzoom.zoomToPoint(toScale, { clientX: e.clientX, clientY: e.clientY });
            e.preventDefault();
        });

        // Fit image to container on every load (handles src changes + initial load)
        const onLoad = () => {
            this._updateView();
            this.syncPinPosition();
            this.syncCropBox();
        };
        this.img.nativeElement.addEventListener('load', onLoad);
        // Handle already-loaded (cached) images
        if (this.img.nativeElement.complete && this.img.nativeElement.naturalWidth > 0) {
            setTimeout(() => onLoad(), 0);
        }

        this.onSmartImagesLayoutChanged = () => {
            setTimeout(() => {
                this._updateView();
                this.syncPinPosition();
                this.syncCropBox();
            }, 250);
        };
        window.addEventListener("smartImagesLayoutChanged", this.onSmartImagesLayoutChanged);
    }

    ngOnDestroy() {
        if (this.onSmartImagesLayoutChanged) window.removeEventListener("smartImagesLayoutChanged", this.onSmartImagesLayoutChanged);
    }

    private syncPinPosition() {
        if (this.pinLocationValue === null || this.panzoom === null) {
            return;
        }
        const location = this.getPinLocation();
        if (!location) return;

        this.pinDiv.nativeElement.style.left = (location.x - 16) + 'px';
        this.pinDiv.nativeElement.style.top = (location.y - 16) + 'px';
        this.pinDiv.nativeElement.style.display = 'block';
    }

    private syncCropBox() {
        if (!this.cropBoxDiv) return;
        const div = this.cropBoxDiv.nativeElement;
        if (!this.cropBox || !this.panzoom) {
            div.style.display = 'none';
            return;
        }
        const img = this.img.nativeElement;
        const nw = img.naturalWidth;
        const nh = img.naturalHeight;
        if (!nw || !nh) { div.style.display = 'none'; return; }
        const rect = img.getClientRects()[0];
        if (!rect) { div.style.display = 'none'; return; }
        const parentRect = img.parentElement.getClientRects()[0];
        const zoom = this.panzoom.getScale();
        const scaleX = (rect.width / zoom) / nw;
        const scaleY = (rect.height / zoom) / nh;
        const dim = this.cropBox.sourceSize ?? 256;
        const sx = Math.max(0, Math.min(this.cropBox.imX - dim / 2, nw - dim));
        const sy = Math.max(0, Math.min(this.cropBox.imY - dim / 2, nh - dim));
        div.style.left   = ((rect.left - parentRect.left) + sx * scaleX * zoom) + 'px';
        div.style.top    = ((rect.top  - parentRect.top)  + sy * scaleY * zoom) + 'px';
        div.style.width  = (dim * scaleX * zoom) + 'px';
        div.style.height = (dim * scaleY * zoom) + 'px';
        div.style.borderColor = this.cropBox.color;
        div.style.display = 'block';
    }

    public clearPin(){
        this.pinLocation = null;
        this.pinDiv.nativeElement.style.display = 'none';
    }

    private getPinLocation(): CoordsXY {

        if (this.panzoom === null) {
            return;
        }

        const zoom = this.panzoom.getScale();

        const rect = this.img.nativeElement.getClientRects()[0];
        if (!rect) return;
        const parentRect = this.img.nativeElement.parentElement.getClientRects()[0];

        const naturalWidth = this.img.nativeElement.naturalWidth;
        const naturalHeight = this.img.nativeElement.naturalHeight;
        
        const width = rect.width / zoom; //this.img.nativeElement.width;
        const height = rect.height / zoom; //this.img.nativeElement.height;
        
        const scaleX = width / naturalWidth;
        const scaleY = height / naturalHeight;

        const left = (rect.left - parentRect.left) + this.pinLocationValue.x * scaleX * zoom;
        const top = (rect.top - parentRect.top) + this.pinLocationValue.y * scaleY * zoom;

        return { x: left, y: top };
    }

    ngOnInit(): void {
    }

    private _updateView(): void {
        if (this.cropFocus) {
            this._focusCrop(this.cropFocus.x, this.cropFocus.y, this.cropFocus.pixelsPerPx);
        } else if (this.autoFit) {
            this._fitToContainer();
        }
    }

    /**
     * Zoom to match the sub-image crop scale (pixelsPerPx = display pixels per source pixel),
     * then pan to center source coord (x, y), clamped so no black bars appear.
     */
    private _focusCrop(x: number, y: number, pixelsPerPx: number): void {
        const img = this.img.nativeElement;
        const nw = img.naturalWidth;
        const nh = img.naturalHeight;
        if (!nw || !nh || !this.panzoom) return;
        const container = this.el.nativeElement;
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        if (!cw || !ch) return;

        // Set CSS size to fit-to-container base (same as _fitToContainer)
        const s = Math.min(cw / nw, ch / nh);
        const fw = Math.round(nw * s);
        const fh = Math.round(nh * s);
        img.style.maxWidth = 'none';
        img.style.maxHeight = 'none';
        img.style.width = `${fw}px`;
        img.style.height = `${fh}px`;

        // Panzoom scale to achieve the desired pixels-per-source-pixel ratio
        const S = pixelsPerPx / s;

        // Panzoom uses: transform: scale(S) translate(Tx, Ty)
        // with transform-origin at element center (fw/2, fh/2).
        // Element CSS point (px, py) renders at container position:
        //   rendered_x = S*(px - fw/2 + Tx) + fw/2
        // Source pixel (x, y) is at element CSS position (x*s, y*s).
        // Setting rendered_x = cw/2 for px = x*s gives:
        //   Tx = (cw - fw)/(2*S) + fw/2 - x*s
        const Tx = (cw - fw) / (2 * S) + fw / 2 - x * s;
        const Ty = (ch - fh) / (2 * S) + fh / 2 - y * s;

        // Clamp to prevent black bars when image is larger than container.
        // Bounds derived by setting rendered left/right image edge to container edge.
        let panX: number;
        let panY: number;
        if (fw * S >= cw) {
            const txMax = fw * (S - 1) / (2 * S);           // image left at container left edge
            const txMin = (2 * cw - fw) / (2 * S) - fw / 2; // image right at container right edge
            panX = Math.min(txMax, Math.max(txMin, Tx));
        } else {
            panX = (cw - fw) / (2 * S);  // center image horizontally
        }
        if (fh * S >= ch) {
            const tyMax = fh * (S - 1) / (2 * S);
            const tyMin = (2 * ch - fh) / (2 * S) - fh / 2;
            panY = Math.min(tyMax, Math.max(tyMin, Ty));
        } else {
            panY = (ch - fh) / (2 * S);  // center image vertically
        }

        this.panzoom.zoom(S, { animate: false });
        this.panzoom.pan(panX, panY, { animate: false });
    }

    private _fitToContainer(): void {
        const img = this.img.nativeElement;
        const nw = img.naturalWidth;
        const nh = img.naturalHeight;
        if (!nw || !nh || !this.panzoom) return;
        const container = this.el.nativeElement;
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        if (!cw || !ch) return;
        const s = Math.min(cw / nw, ch / nh);
        const fw = Math.round(nw * s);
        const fh = Math.round(nh * s);
        // Set an explicit CSS size equal to the fitted dimensions so that panzoom
        // scale=1 means "fit to container", bypassing the 320px CSS constraints.
        img.style.maxWidth = 'none';
        img.style.maxHeight = 'none';
        img.style.width = `${fw}px`;
        img.style.height = `${fh}px`;
        this.panzoom.zoom(1, { animate: false });
        // At scale=1 visual top-left = (panX, panY), so center directly.
        this.panzoom.pan((cw - fw) / 2, (ch - fh) / 2, { animate: false });
    }

    private getPos(e: MouseEvent): CoordsXY {
        const zoom = this.panzoom.getScale();

        const rect = this.img.nativeElement.getClientRects()[0];
        const naturalWidth = this.img.nativeElement.naturalWidth;
        const naturalHeight = this.img.nativeElement.naturalHeight;
        const width = rect.width / zoom; //this.img.nativeElement.width;
        const height = rect.height / zoom; //this.img.nativeElement.height;
        const scaleX = width / naturalWidth;
        const scaleY = height / naturalHeight;

        const relx = e.clientX - rect.left;
        const rely = e.clientY - rect.top;

        const x = relx / zoom;
        const y = rely / zoom;

        const realX = x / scaleX;
        const realY = y / scaleY;

        return { x: realX, y: realY };
    }

}
