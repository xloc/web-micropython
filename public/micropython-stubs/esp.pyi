"""
esp — functions related to the ESP8266 and ESP32

Sourced from docs/library/esp.rst. Some functions are ESP8266 only; see notes.
"""

from typing import Optional

# Log level constants for esp.osdebug on ESP32
LOG_NONE: int
LOG_ERROR: int
LOG_WARN: int
LOG_INFO: int
LOG_DEBUG: int
LOG_VERBOSE: int

def osdebug(uart_no: Optional[int], level: Optional[int] = ...) -> None:
    """
    Change the level of OS serial debug log messages.

    ESP32 form:
      - osdebug(None) restores default OS debug level (LOG_ERROR)
      - osdebug(0) enables all default OS debug messages (LOG_INFO)
      - osdebug(0, level) sets the OS debug level to the given value

    Note: LOG_DEBUG and LOG_VERBOSE usually require a custom build to enable.
    """
    ...

# The following functions are ESP8266 only (present for reference):
def sleep_type(sleep_type: Optional[int] = ...) -> int: ...
def deepsleep(time_us: int = ...) -> None: ...
def flash_id() -> int: ...
def flash_size() -> int: ...
def flash_user_start() -> int: ...
def flash_read(byte_offset: int, length_or_buffer: int | bytearray) -> None: ...
def flash_write(byte_offset: int, data: bytes | bytearray) -> None: ...
def flash_erase(sector_no: int) -> None: ...
