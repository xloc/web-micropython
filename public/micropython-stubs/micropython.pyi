"""
micropython – access and control MicroPython internals

Functions and classes to control MicroPython run-time behaviour and obtain
implementation-specific information. Sourced from docs/library/micropython.rst.
"""

from typing import Any, Optional, Callable, overload

def const(expr: Any) -> Any:
    """
    Used to declare that the expression is a constant so that the compiler can
    optimise it. Constants declared this way are still accessible as globals.
    Constants whose names start with an underscore are hidden and don't take
    memory at runtime.
    """
    ...

@overload
def opt_level() -> int: ...
@overload
def opt_level(level: int) -> None: ...

def alloc_emergency_exception_buf(size: int) -> None:
    """
    Allocate size bytes of RAM for the emergency exception buffer to allow
    exceptions (and tracebacks) in low-memory contexts like IRQ handlers.
    """
    ...

def mem_info(verbose: int = ...) -> None:
    """
    Print information about currently used memory. With verbose non-zero,
    prints additional details such as a map of the heap.
    """
    ...

def qstr_info(verbose: int = ...) -> None:
    """
    Print information about interned strings. With verbose non-zero, prints
    names of RAM-interned strings.
    """
    ...

def stack_use() -> int:
    """
    Return an integer representing the current amount of stack being used.
    Useful for computing differences between points in a program.
    """
    ...

def heap_lock() -> int:
    """
    Lock the heap to prevent allocations. Returns current lock depth after
    locking. Further allocations raise MemoryError until unlocked.
    """
    ...

def heap_unlock() -> int:
    """
    Unlock the heap (decrease lock depth). Returns current lock depth after
    unlocking, with 0 meaning the heap is not locked.
    """
    ...

def heap_locked() -> int:
    """
    Return the current heap lock depth as a non-negative integer. Requires
    MICROPY_PY_MICROPYTHON_HEAP_LOCKED to be enabled on most ports.
    """
    ...

def kbd_intr(chr: int) -> None:
    """
    Set the character that raises KeyboardInterrupt. Pass -1 to disable,
    or 3 to restore Ctrl-C behaviour.
    """
    ...

def schedule(func: Callable[[Any], Any], arg: Any) -> None:
    """
    Schedule function func to be executed very soon with argument arg. May
    raise RuntimeError if the schedule queue is full.
    """
    ...

class RingIO:
    """
    RingIO(size)
    RingIO(buffer)

    Provides a fixed-size ringbuffer for bytes with a stream interface. Can be
    considered like a fifo queue variant of io.BytesIO.
    """
    def __init__(self, size_or_buf: int | bytearray): ...
    def any(self) -> int: ...
    def read(self, nbytes: Optional[int] = ...) -> bytes: ...
    def readline(self, nbytes: Optional[int] = ...) -> bytes: ...
    def readinto(self, buf: bytearray, nbytes: Optional[int] = ...) -> int: ...
    def write(self, buf: bytes | bytearray) -> int: ...
    def close(self) -> None: ...
