"""
neopixel — control of WS2812 / NeoPixel LEDs

APIs sourced from micropython-master/docs/library/neopixel.rst.
Docstrings are adapted from the official documentation.
"""

from typing import Any


class NeoPixel:
    """
    class NeoPixel

    Stores pixel data for a WS2812/NeoPixel LED strip connected to a pin.
    Set pixel values then call write() to update the strip.

    Example usage:

        import neopixel
        p = machine.Pin(0, machine.Pin.OUT)
        n = neopixel.NeoPixel(p, 8)
        n[0] = (255, 0, 0)
        n.write()
    """

    def __init__(
        self,
        pin: Any,
        n: int,
        *,
        bpp: int = 3,
        timing: int | tuple[int, int, int, int] = 1,
    ) -> None: ...

    def fill(self, pixel: tuple[int, int, int] | tuple[int, int, int, int]) -> None:
        """Set all pixels to the given RGB/RGBW tuple value."""
        ...

    def write(self) -> None:
        """Write the current pixel data to the strip."""
        ...

    def __len__(self) -> int:
        """Return the number of LEDs in the strip."""
        ...

    def __setitem__(self, index: int, val: tuple[int, int, int] | tuple[int, int, int, int]) -> None:
        """Set the pixel at index to the given RGB/RGBW tuple."""
        ...

    def __getitem__(self, index: int) -> tuple[int, int, int] | tuple[int, int, int, int]:
        """Return the pixel at index as an RGB/RGBW tuple."""
        ...

