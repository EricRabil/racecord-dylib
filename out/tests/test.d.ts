import { DylibBase } from "..";
export declare type MainType = {
    taylorSwift: boolean;
};
export declare type EventType = {
    data: any;
};
export interface TestPlugin extends DylibBase<EventType> {
    isCrazy(): boolean;
}
