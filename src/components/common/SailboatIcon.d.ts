import type { SVGProps } from 'react';

export type SailboatIconProps = Pick<SVGProps<SVGSVGElement>, 'className'>;

declare const SailboatIcon: (props: SailboatIconProps) => JSX.Element;

export { SailboatIcon };
export default SailboatIcon;
