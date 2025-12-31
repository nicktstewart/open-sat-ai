/**
 * Type declarations for @google/earthengine
 * Minimal types needed for this PoC
 */

declare module "@google/earthengine" {
  export interface AuthConfig {
    client_email: string;
    private_key: string;
  }

  export interface ImageCollection {
    filterBounds(geometry: any): ImageCollection;
    filterDate(start: string, end: string): ImageCollection;
    filter(filter: any): ImageCollection;
    map(func: (img: Image) => Image): ImageCollection;
    median(): Image;
    mean(): Image;
    select(bands: string[] | string): ImageCollection;
  }

  export interface Image {
    select(bands: string[] | string): Image;
    normalizedDifference(bands: string[]): Image;
    updateMask(mask: Image): Image;
    subtract(other: Image): Image;
    divide(other: number): Image;
    addBands(bands: Image): Image;
    bitwiseAnd(value: any): Image;
    eq(value: any): Image;
    and(other: Image): Image;
    rename(name: string): Image;
    reduceRegion(config: any): any;
    getMapId(params: any, callback: (data: any, error?: string) => void): void;
  }

  export interface GeometryConstructor {
    Rectangle(coords: number[]): any;
  }

  export interface FilterConstructor {
    lt(property: string, value: number): any;
  }

  export interface ListConstructor {
    sequence(start: number, end: number): any;
  }

  export interface ReducerConstructor {
    mean(): any;
  }

  export interface FeatureCollection {
    filterBounds(geometry: any): FeatureCollection;
    aggregate_array(property: string): any;
  }

  export interface Data {
    authenticateViaPrivateKey(
      config: AuthConfig,
      onSuccess: () => void,
      onError: (error: Error) => void
    ): void;
    getMapId(params: any, callback: (data: any, error?: string) => void): void;
  }

  export const data: Data;

  export function initialize(
    opt_baseurl?: string | null,
    opt_tileurl?: string | null,
    success?: () => void,
    failure?: (error: Error) => void
  ): void;

  export function ImageCollection(id: string): ImageCollection;
  export function Image(id: string | number): Image;
  export function Geometry(): GeometryConstructor;
  export function FeatureCollection(id: string): FeatureCollection;
  export function Date(date: string): any;
  export function Number(value: number): any;

  const ee: {
    data: Data;
    initialize: typeof initialize;
    ImageCollection: typeof ImageCollection;
    Image: typeof Image;
    Geometry: GeometryConstructor;
    Filter: FilterConstructor;
    Reducer: ReducerConstructor;
    List: ListConstructor;
    FeatureCollection: typeof FeatureCollection;
    Date: typeof Date;
    Number: typeof Number;
  };

  export default ee;
}
