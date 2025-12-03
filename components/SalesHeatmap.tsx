import React, { useEffect } from 'react';
import { MapContainer, TileLayer, useMap, CircleMarker, Tooltip } from 'react-leaflet';
import { GeoStats } from '../types';
import L from 'leaflet';

// --- SIMPLEHEAT CLASS (Embedded for reliability) ---
class SimpleHeat {
    _canvas: HTMLCanvasElement;
    _ctx: CanvasRenderingContext2D;
    _width: number;
    _height: number;
    _max: number;
    _data: any[];
    _r: number;
    _circle: HTMLCanvasElement | null = null;
    _grad: Uint8ClampedArray | null = null;
    defaultRadius: number = 25;
    defaultGradient: any = { 0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red' };

    constructor(canvas: HTMLCanvasElement) {
        this._canvas = canvas;
        this._ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
        this._width = canvas.width;
        this._height = canvas.height;
        this._max = 1;
        this._data = [];
        this._r = 25;
    }

    data(data: any[]) {
        this._data = data;
        return this;
    }

    max(max: number) {
        this._max = max;
        return this;
    }

    add(point: any[]) {
        this._data.push(point);
        return this;
    }

    clear() {
        this._data = [];
        return this;
    }

    radius(r: number, blur?: number) {
        blur = blur === undefined ? 15 : blur;
        const circle = this._circle = document.createElement('canvas');
        const ctx = circle.getContext('2d') as CanvasRenderingContext2D;
        const r2 = this._r = r + blur;

        circle.width = circle.height = r2 * 2;

        ctx.shadowOffsetX = ctx.shadowOffsetY = r2 * 2;
        ctx.shadowBlur = blur;
        ctx.shadowColor = 'black';

        ctx.beginPath();
        ctx.arc(-r2, -r2, r, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.fill();

        return this;
    }

    resize() {
        this._width = this._canvas.width;
        this._height = this._canvas.height;
    }

    gradient(grad: any) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
        const gradient = ctx.createLinearGradient(0, 0, 0, 256);

        canvas.width = 1;
        canvas.height = 256;

        for (var i in grad) {
            gradient.addColorStop(+i, grad[i]);
        }

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 1, 256);

        this._grad = ctx.getImageData(0, 0, 1, 256).data;

        return this;
    }

    draw(minOpacity?: number) {
        if (!this._circle) this.radius(this.defaultRadius);
        if (!this._grad) this.gradient(this.defaultGradient);

        const ctx = this._ctx;

        ctx.clearRect(0, 0, this._width, this._height);

        for (let i = 0, len = this._data.length, p; i < len; i++) {
            p = this._data[i];
            ctx.globalAlpha = Math.max(p[2] / this._max, minOpacity === undefined ? 0.05 : minOpacity);
            ctx.drawImage(this._circle as HTMLCanvasElement, p[0] - this._r, p[1] - this._r);
        }

        const colored = ctx.getImageData(0, 0, this._width, this._height);
        this._colorize(colored.data, this._grad as Uint8ClampedArray);
        ctx.putImageData(colored, 0, 0);

        return this;
    }

    _colorize(pixels: Uint8ClampedArray, gradient: Uint8ClampedArray) {
        for (let i = 0, len = pixels.length, j; i < len; i += 4) {
            j = pixels[i + 3] * 4; 

            if (j) {
                pixels[i] = gradient[j];
                pixels[i + 1] = gradient[j + 1];
                pixels[i + 2] = gradient[j + 2];
            }
        }
    }
}

// --- LEAFLET HEATMAP LAYER PATCH ---
if (!(L as any).HeatLayer) {
    (L as any).HeatLayer = (L.Layer ? L.Layer : L.Class).extend({
        initialize: function (latlngs: any, options: any) {
            this._latlngs = latlngs;
            L.setOptions(this, options);
        },

        setLatLngs: function (latlngs: any) {
            this._latlngs = latlngs;
            return this.redraw();
        },

        addLatLng: function (latlng: any) {
            this._latlngs.push(latlng);
            return this.redraw();
        },

        setOptions: function (options: any) {
            L.setOptions(this, options);
            if (this._heat) {
                this._updateOptions();
            }
            return this.redraw();
        },

        redraw: function () {
            if (this._heat && !this._frame && this._map && !this._map._animating) {
                this._frame = L.Util.requestAnimFrame(this._redraw, this);
            }
            return this;
        },

        onAdd: function (map: any) {
            this._map = map;

            if (!this._canvas) {
                this._initCanvas();
            }

            if (this.options.pane) {
                this.getPane().appendChild(this._canvas);
            } else {
                map._panes.overlayPane.appendChild(this._canvas);
            }

            map.on('moveend', this._reset, this);

            if (map.options.zoomAnimation && L.Browser.any3d) {
                map.on('zoomanim', this._animateZoom, this);
            }

            this._reset();
        },

        onRemove: function (map: any) {
            if (this.options.pane) {
                this.getPane().removeChild(this._canvas);
            } else {
                map.getPanes().overlayPane.removeChild(this._canvas);
            }

            map.off('moveend', this._reset, this);

            if (map.options.zoomAnimation) {
                map.off('zoomanim', this._animateZoom, this);
            }
        },

        addTo: function (map: any) {
            map.addLayer(this);
            return this;
        },

        _initCanvas: function () {
            var canvas = this._canvas = L.DomUtil.create('canvas', 'leaflet-heatmap-layer leaflet-layer');

            var originProp = L.DomUtil.testProp(['transformOrigin', 'WebkitTransformOrigin', 'msTransformOrigin']);
            canvas.style[originProp as any] = '50% 50%';

            var size = this._map.getSize();
            canvas.width = size.x;
            canvas.height = size.y;

            var animated = this._map.options.zoomAnimation && L.Browser.any3d;
            L.DomUtil.addClass(canvas, 'leaflet-zoom-' + (animated ? 'animated' : 'hide'));

            this._heat = new SimpleHeat(canvas);
            this._updateOptions();
        },

        _updateOptions: function () {
            this._heat.radius(this.options.radius || 25, this.options.blur);

            if (this.options.gradient) {
                this._heat.gradient(this.options.gradient);
            }
            if (this.options.max) {
                this._heat.max(this.options.max);
            }
        },

        _reset: function () {
            var topLeft = this._map.containerPointToLayerPoint([0, 0]);
            L.DomUtil.setPosition(this._canvas, topLeft);

            var size = this._map.getSize();

            if (this._heat._width !== size.x) {
                this._canvas.width = this._heat._width = size.x;
            }
            if (this._heat._height !== size.y) {
                this._canvas.height = this._heat._height = size.y;
            }

            this._redraw();
        },

        _redraw: function () {
            if (!this._map) {
                return;
            }
            var data = [],
                r = this._heat._r,
                size = this._map.getSize(),
                bounds = new L.Bounds(
                    L.point([-r, -r]),
                    size.add([r, r])),
                max = this.options.max === undefined ? 1 : this.options.max,
                maxZoom = this.options.maxZoom === undefined ? this._map.getMaxZoom() : this.options.maxZoom,
                v = 1 / Math.pow(2, Math.max(0, Math.min(maxZoom - this._map.getZoom(), 12))),
                cellSize = r / 2,
                grid: any[] = [],
                panePos = this._map._getMapPanePos(),
                offsetX = panePos.x % cellSize,
                offsetY = panePos.y % cellSize,
                i, len, p, cell, x, y, j, len2, k;

            for (i = 0, len = this._latlngs.length; i < len; i++) {
                p = this._map.latLngToContainerPoint(this._latlngs[i]);
                if (bounds.contains(p)) {
                    x = Math.floor((p.x - offsetX) / cellSize) + 2;
                    y = Math.floor((p.y - offsetY) / cellSize) + 2;

                    var alt =
                        this._latlngs[i].alt !== undefined ? this._latlngs[i].alt :
                        this._latlngs[i][2] !== undefined ? +this._latlngs[i][2] : 1;
                    k = alt * v;

                    grid[y] = grid[y] || [];
                    cell = grid[y][x];

                    if (!cell) {
                        grid[y][x] = [p.x, p.y, k];
                    } else {
                        cell[0] = (cell[0] * cell[2] + p.x * k) / (cell[2] + k);
                        cell[1] = (cell[1] * cell[2] + p.y * k) / (cell[2] + k);
                        cell[2] += k;
                    }
                }
            }

            for (i = 0, len = grid.length; i < len; i++) {
                if (grid[i]) {
                    for (j = 0, len2 = grid[i].length; j < len2; j++) {
                        cell = grid[i][j];
                        if (cell) {
                            data.push([
                                Math.round(cell[0]),
                                Math.round(cell[1]),
                                Math.min(cell[2], max)
                            ]);
                        }
                    }
                }
            }

            this._heat.data(data).draw(this.options.minOpacity);

            this._frame = null;
        },

        _animateZoom: function (e: any) {
            var scale = this._map.getZoomScale(e.zoom),
                offset = this._map._getCenterOffset(e.center).multiplyBy(-scale).subtract(this._map._getMapPanePos());

            if (L.DomUtil.setTransform) {
                L.DomUtil.setTransform(this._canvas, offset, scale);
            } else {
                this._canvas.style.transform = (L.DomUtil as any).getTranslateString(offset) + ' scale(' + scale + ')';
            }
        }
    });

    (L as any).heatLayer = function (latlngs: any, options: any) {
        return new (L as any).HeatLayer(latlngs, options);
    };
}

interface SalesHeatmapProps {
  data: GeoStats[];
}

const HeatmapController: React.FC<{ data: GeoStats[] }> = ({ data }) => {
  const map = useMap();
  const heatLayerRef = React.useRef<any>(null);

  useEffect(() => {
    if (!map || !data || data.length === 0) return;

    if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
    }

    // Filter strict positive data to avoid log(0) issues or distortion
    const positiveData = data.filter(d => d.revenue > 0);
    
    if (positiveData.length === 0) return;

    // Min-Max Log Normalization Logic
    const logValues = positiveData.map(d => Math.log(d.revenue));
    const maxLog = Math.max(...logValues);
    const minLog = Math.min(...logValues);
    const range = maxLog - minLog;

    const points = positiveData.map(d => {
        const val = Math.log(d.revenue);
        const intensity = range > 0 ? (val - minLog) / range : 1.0;
        return [d.lat, d.lng, intensity];
    });

    const heat = (L as any).heatLayer(points, { 
        radius: 35,
        blur: 25,
        maxZoom: 10,
        max: 1.0, 
        minOpacity: 0.3, 
        gradient: { 
            0.0: 'green',   // Low
            0.5: 'yellow',  // Medium
            0.7: 'orange',  // High-Medium
            1.0: 'red'      // High
        }
    });
    
    heat.addTo(map);
    heatLayerRef.current = heat;
    
    // AUTO-FIT ZOOM LOGIC
    if (points.length > 0) {
        const bounds = L.latLngBounds(points.map(p => [p[0], p[1]] as [number, number]));
        map.fitBounds(bounds, { 
            padding: [50, 50], // Add padding to ensure edges aren't cut off
            maxZoom: 12,       // Don't zoom in too close if only 1 city
            animate: true 
        });
    }

  }, [map, data]);

  return null;
};

const Legend: React.FC = () => {
    return (
        <div className="absolute top-4 right-4 bg-[#151E32]/90 border border-white/10 p-3 rounded shadow-xl z-[1000] backdrop-blur-sm">
            <h4 className="text-[10px] font-bold text-text-dim uppercase mb-2">Intensidade de Faturamento</h4>
            <div className="flex items-center gap-2 mb-1">
                <span className="w-3 h-3 rounded-full bg-red-500"></span>
                <span className="text-[10px] text-white">Alto (Top Performance)</span>
            </div>
            <div className="flex items-center gap-2 mb-1">
                <span className="w-3 h-3 rounded-full bg-orange-500"></span>
                <span className="text-[10px] text-white">Médio-Alto</span>
            </div>
            <div className="flex items-center gap-2 mb-1">
                <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                <span className="text-[10px] text-white">Médio</span>
            </div>
            <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-green-500"></span>
                <span className="text-[10px] text-white">Baixo (Oportunidade)</span>
            </div>
        </div>
    );
};

// Component to render invisible circles for tooltips
const InteractiveLayer: React.FC<{ data: GeoStats[] }> = ({ data }) => {
    const points = data.slice(0, 150); // Limit for performance

    return (
        <>
            {points.map((city, idx) => (
                <CircleMarker 
                    key={`${city.city}-${idx}`}
                    center={[city.lat, city.lng]}
                    radius={25} 
                    pathOptions={{ 
                        color: 'transparent', 
                        fillColor: 'transparent', 
                        fillOpacity: 0 
                    }}
                >
                    <Tooltip direction="top" offset={[0, -10]} opacity={1} className="custom-tooltip">
                        <div className="font-sans text-xs bg-[#151E32] text-white p-2 rounded border border-white/20 shadow-xl">
                            <strong className="block text-sm text-primary mb-1 uppercase">{city.city} - {city.state}</strong>
                            <div className="flex justify-between gap-4">
                                <span className="text-text-dim">Setor:</span>
                                <span className="font-bold text-white">{(city as any).sector || 'Multimarcas'}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span className="text-text-dim">Faturamento:</span>
                                <span className="font-bold text-success">R$ {city.revenue.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
                            </div>
                        </div>
                    </Tooltip>
                </CircleMarker>
            ))}
        </>
    );
};

const SalesHeatmap: React.FC<SalesHeatmapProps> = ({ data }) => {
  return (
    <div className="h-[600px] w-full bg-[#151E32] relative z-0 rounded-b-xl overflow-hidden">
       <MapContainer 
          center={[-25.4284, -49.2733]} 
          zoom={7} 
          scrollWheelZoom={false} 
          style={{ height: '100%', width: '100%', background: '#111' }}
        >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
        />
        
        <HeatmapController data={data} />

        <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
            zIndex={1000}
        />

        <InteractiveLayer data={data} />
        
        <div className="leaflet-top leaflet-right">
            <Legend />
        </div>

      </MapContainer>
    </div>
  );
};

export default SalesHeatmap;