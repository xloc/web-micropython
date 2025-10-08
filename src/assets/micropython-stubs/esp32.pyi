"""
esp32 — functionality specific to the ESP32

Sourced from docs/library/esp32.rst. Provides wake configuration, temperature,
IDF heap/task info and related constants.
"""

from typing import Any, Iterable

# Constants used by wake and heap info
WAKEUP_ALL_LOW: int
WAKEUP_ANY_HIGH: int
HEAP_DATA: int
HEAP_EXEC: int

def wake_on_touch(wake: bool) -> None:
    """
    Configure whether a touch will wake the device from sleep. Availability
    depends on board touch sensor support.
    """
    ...

def wake_on_ulp(wake: bool) -> None:
    """
    Configure whether the ULP co-processor can wake the device from sleep.
    Availability depends on board ULP support.
    """
    ...

def wake_on_ext0(pin: Any, level: int) -> None:
    """
    Configure how EXT0 wakes the device from sleep. 'level' is WAKEUP_ALL_LOW
    or WAKEUP_ANY_HIGH.
    """
    ...

def wake_on_ext1(pins: Iterable[Any], level: int) -> None:
    """
    Configure how EXT1 wakes the device from sleep. 'pins' is a tuple/list of
    Pin objects. 'level' is WAKEUP_ALL_LOW or WAKEUP_ANY_HIGH.
    """
    ...

def gpio_deep_sleep_hold(enable: bool) -> None:
    """Configure whether non-RTC GPIO configuration is retained in deep sleep."""
    ...

def raw_temperature() -> int:
    """Read and return the raw value from the internal temperature sensor."""
    ...

def idf_heap_info(capabilities: int) -> list[tuple[int, int, int, int]]:
    """
    Return a list of tuples (total, free, largest_free_block, min_free_seen)
    for ESP-IDF heap regions matching the given capability mask (e.g. HEAP_DATA,
    HEAP_EXEC). See docs for details.
    """
    ...

def idf_task_info() -> tuple[int, list[tuple[int, str, int, int, int | None, int, int | None]]]:
    """
    Return (total_runtime, tasks). Each task is a 7-tuple of (id, name, state,
    priority, runtime, stack high water mark, core_id). Some fields may be None
    depending on build configuration.
    """
    ...
