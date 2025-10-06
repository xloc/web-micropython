"""
network — network configuration

Common NIC interface and WiFi WLAN class for network configuration.
Sourced from docs/library/network.rst and docs/library/network.WLAN.rst.
"""

from typing import Any, Optional

# Module-level status constants (see WLAN.status())
STAT_IDLE: int
STAT_CONNECTING: int
STAT_WRONG_PASSWORD: int
STAT_NO_AP_FOUND: int
STAT_CONNECT_FAIL: int
STAT_GOT_IP: int

def country(code: Optional[str] = ...) -> str:
    """
    Get or set the two-letter ISO 3166-1 Alpha-2 country code used for radio
    compliance. Called without parameters, returns the current code.
    """
    ...

def hostname(name: Optional[str] = ...) -> str:
    """
    Get or set the hostname identifying this device on the network.
    Called without parameters, returns the current hostname.
    """
    ...

def ipconfig(param: Any = ..., /, **kwargs: Any) -> Any:
    """
    Get or set global IP configuration parameters, e.g. dns and prefer (4/6).
    Accepts either a single string parameter name or keyword arguments.
    """
    ...

def phy_mode(mode: Optional[int] = ...) -> int:
    """
    Get or set PHY mode. Availability: ESP8266.
    """
    ...

class WLAN:
    """
    class WLAN – control built-in WiFi interfaces

    Create a WLAN interface in station (IF_STA) or access-point (IF_AP) mode.
    """

    # Interface constants
    IF_STA: int
    IF_AP: int

    # Power management constants
    PM_PERFORMANCE: int
    PM_POWERSAVE: int
    PM_NONE: int

    def __init__(self, interface_id: int = ...) -> None: ...

    def active(self, is_active: Optional[bool] = ...) -> bool:
        """
        Activate (up) or deactivate (down) the interface when a boolean is
        passed; otherwise return the current active state.
        """
        ...

    def connect(self, ssid: Optional[str] = ..., key: Optional[str] = ..., *, bssid: Optional[bytes] = ...) -> None:
        """
        Connect to the specified wireless network. If bssid is given then the
        connection is restricted to the AP with that MAC address.
        """
        ...

    def disconnect(self) -> None:
        """Disconnect from the currently connected wireless network."""
        ...

    def scan(self) -> list[tuple[Any, Any, int, int, int, int]]:
        """
        Scan for available wireless networks and return a list of tuples:
        (ssid, bssid, channel, RSSI, security, hidden).
        """
        ...

    def status(self, param: Optional[str] = ...) -> Any:
        """
        Return the current wireless connection status, or a specific status
        value when param is provided (e.g. 'rssi' for STA, 'stations' for AP).
        """
        ...

    def isconnected(self) -> bool:
        """Return True if connected (STA has IP, or AP has a station)."""
        ...

    def ifconfig(self, config: Optional[tuple[str, str, str, str]] = ...) -> tuple[str, str, str, str] | None:
        """
        Get or set (ip, subnet, gateway, dns). Passing a tuple sets values,
        otherwise returns the current 4-tuple.
        """
        ...

    def config(self, param: Any = ..., /, **kwargs: Any) -> Any:
        """
        Get or set general network interface parameters such as ssid, channel,
        hidden, security, key, hostname, reconnects, txpower, pm.
        """
        ...
