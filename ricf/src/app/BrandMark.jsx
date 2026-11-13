/** The RIC emblem in a soft rounded tile. */
export function BrandMark({ size = 36 }) {
    return (
        <span className="brand-mark" style={{ width: size, height: size }}>
            <img src="/images/logo.jpg" alt="" width={size} height={size} />
        </span>
    );
}
