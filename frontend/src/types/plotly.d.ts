declare module 'react-plotly.js' {
  import { PlotData, Layout, Config } from 'plotly.js';
  import { Component } from 'react';

  interface AxisLayout {
    title?: string | { text: string };
    tickformat?: string;
    range?: number[];
    zeroline?: boolean;
    showgrid?: boolean;
    tickangle?: number;
  }

  export interface PlotParams {
    data: Array<Partial<PlotData> & {
      type?: string;
      y?: number[];
      x?: any[];
      name?: string;
      boxpoints?: string;
      marker?: { color?: string };
      boxmean?: boolean;
      hovertemplate?: string;
    }>;
    layout?: Partial<Layout> & {
      title?: string | { text: string; font?: { size?: number } };
      yaxis?: AxisLayout;
      xaxis?: AxisLayout;
      showlegend?: boolean;
      height?: number;
      margin?: { t: number; r: number; b: number; l: number };
    };
    config?: Partial<Config>;
    style?: React.CSSProperties;
    className?: string;
  }

  export default class Plot extends Component<PlotParams> {}
} 