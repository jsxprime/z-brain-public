import os
import re

path = "/opt/hermes/.venv/lib/python3.13/site-packages/mcp/types.py"
with open(path, "r") as f:
    content = f.read()

if "PingNotification" not in content:
    ping_def = """

class PingNotificationParams(BaseModel):
    model_config = ConfigDict(extra="allow")

class PingNotification(Notification[PingNotificationParams | None, Literal["ping"]]):
    method: Literal["ping"] = "ping"
    params: PingNotificationParams | None = None

"""
    # Add definition before ServerNotificationType
    content = content.replace("ServerNotificationType: TypeAlias = (", ping_def + "ServerNotificationType: TypeAlias = (\n    PingNotification\n    |")
    
    with open(path, "w") as f:
        f.write(content)
    print("Patched mcp/types.py to include PingNotification")
else:
    print("mcp/types.py already patched")
